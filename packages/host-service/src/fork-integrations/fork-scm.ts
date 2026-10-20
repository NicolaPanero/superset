import type {
	ForkComment,
	ForkPullRequest,
	ForkRepository,
	ForkRepositoryRef,
} from "@superset/shared/fork-integrations";
import {
	FORK_PROVIDER_DEFINITIONS,
	forkRepositoryKey,
} from "@superset/shared/fork-integrations";
import { TRPCError } from "@trpc/server";
import type { ForkApi } from "./fork-api";
import { forkAvailability } from "./fork-availability";
import { forkBitbucketRepositories } from "./fork-bitbucket-repositories";
import { forkText } from "./fork-http";
import type { ForkSourceControlProvider } from "./fork-provider";

interface BBUser {
	display_name: string;
	nickname?: string;
	uuid?: string;
	links?: { avatar?: { href: string } };
}
export interface BBRepo {
	uuid: string;
	full_name: string;
	name: string;
	slug: string;
	links: { html: { href: string }; clone: { name: string; href: string }[] };
	mainbranch?: { name: string };
}
interface BBPull {
	draft?: boolean;
	id: number;
	title: string;
	description: string;
	state: string;
	author: BBUser;
	source: {
		branch: { name: string };
		commit: { hash: string };
		repository?: { full_name: string };
	};
	destination: {
		branch: {
			name: string;
			merge_strategies?: string[];
			default_merge_strategy?: string;
		};
	};
	updated_on: string;
	links: { html: { href: string } };
	participants?: {
		user: BBUser;
		role: string;
		approved: boolean;
		state?: string | null;
	}[];
}
interface GHPull {
	number: number;
	title: string;
	body: string | null;
	state: string;
	merged_at?: string | null;
	html_url: string;
	user: { login: string };
	head: {
		ref: string;
		sha: string;
		repo: { name: string; owner: { login: string } } | null;
	};
	base: { ref: string };
	updated_at: string;
}
interface GHRepo {
	id: number;
	full_name: string;
	name: string;
	owner: { login: string };
	html_url: string;
	clone_url: string;
	default_branch: string;
}
export interface ForkPage<T> {
	items: T[];
	nextCursor: string | null;
}
const part = (s: string) => encodeURIComponent(s);
const diffstatCache = new Map<
	string,
	{ at: number; value: { additions: number; deletions: number } }
>();
const commitChecksCache = new Map<
	string,
	{
		value: Awaited<ReturnType<ForkScmProvider["commitChecks"]>>;
		at: number;
	}
>();
function repoPath(r: ForkRepositoryRef) {
	return r.provider === "github"
		? `/repos/${part(r.owner)}/${part(r.name)}`
		: `/repositories/${part(r.owner)}/${part(r.name)}`;
}
function bbPR(
	p: BBPull,
	r: ForkRepositoryRef,
	connectionId: string,
): ForkPullRequest {
	return {
		repository: r,
		connectionId,
		number: p.id,
		title: p.title,
		description: p.description ?? "",
		url: p.links.html.href,
		state:
			p.state === "MERGED" ? "merged" : p.state === "OPEN" ? "open" : "closed",
		author: p.author.nickname ?? p.author.display_name,
		sourceBranch: p.source.branch.name,
		targetBranch: p.destination.branch.name,
		headCommit: p.source.commit.hash,
		updatedAt: p.updated_on,
		sourceRepository: p.source.repository
			? {
					...r,
					owner: p.source.repository.full_name.split("/")[0] ?? r.owner,
					name: p.source.repository.full_name.split("/")[1] ?? r.name,
				}
			: r,
		mergeMethods: p.destination.branch.merge_strategies,
		defaultMergeMethod: p.destination.branch.default_merge_strategy,
		isDraft: p.draft ?? false,
		...(p.participants
			? {
					reviewers: p.participants
						.filter((x) => x.role === "REVIEWER" || x.approved || x.state)
						.map((x) => ({
							name: x.user.display_name,
							avatarUrl: x.user.links?.avatar?.href ?? null,
							state:
								x.state === "changes_requested"
									? ("changes_requested" as const)
									: x.approved
										? ("approved" as const)
										: ("pending" as const),
						})),
				}
			: {}),
	};
}
function ghPR(
	p: GHPull,
	r: ForkRepositoryRef,
	connectionId: string,
): ForkPullRequest {
	return {
		repository: r,
		connectionId,
		number: p.number,
		title: p.title,
		description: p.body ?? "",
		url: p.html_url,
		state: p.merged_at ? "merged" : p.state === "open" ? "open" : "closed",
		author: p.user.login,
		sourceBranch: p.head.ref,
		targetBranch: p.base.ref,
		headCommit: p.head.sha,
		updatedAt: p.updated_at,
		...(p.head.repo
			? {
					sourceRepository: {
						...r,
						owner: p.head.repo.owner.login,
						name: p.head.repo.name,
					},
				}
			: {}),
	};
}
function nextPath(
	next: string | undefined,
	base: string,
	prefix: string | readonly string[],
): string | null {
	if (!next) return null;
	const url = new URL(next),
		expected = new URL(base);
	if (
		url.origin !== expected.origin ||
		!(typeof prefix === "string" ? [prefix] : prefix).some((path) =>
			url.pathname.startsWith(expected.pathname + path),
		)
	)
		throw new TRPCError({
			code: "BAD_GATEWAY",
			message: "Invalid pagination response",
		});
	return url.pathname.slice(expected.pathname.length) + url.search;
}
export class ForkScmProvider implements ForkSourceControlProvider {
	constructor(readonly api: ForkApi) {}
	async searchBitbucket(
		id: string,
		r: ForkRepositoryRef,
		input: {
			query?: string;
			author?: string;
			reviewer?: string;
			includeClosed?: boolean;
			mergedOnly?: boolean;
			page: number;
			limit: number;
		},
	) {
		this.assert(id, r);
		const prefix = `${repoPath(r)}/pullrequests`;
		const params = new URLSearchParams({
			page: String(input.page),
			pagelen: String(input.limit),
			sort: "-updated_on",
		});
		for (const state of input.mergedOnly
			? ["MERGED"]
			: input.includeClosed
				? ["OPEN", "MERGED", "DECLINED", "SUPERSEDED"]
				: ["OPEN"])
			params.append("state", state);
		const filters: string[] = [];
		const query = input.query?.trim();
		if (query) {
			const number =
				query.match(/^#?(\d+)$/)?.[1] ??
				query.match(
					/^https:\/\/bitbucket\.org\/[^/]+\/[^/]+\/pull-requests\/(\d+)\/?$/,
				)?.[1];
			if (number) filters.push(`id=${Number(number)}`);
			else
				filters.push(
					`(title~${JSON.stringify(query)} OR source.branch.name~${JSON.stringify(query)})`,
				);
		}
		if (input.author)
			filters.push(
				`(${input.author
					.split(",")
					.map(
						(author) =>
							`author.nickname=${JSON.stringify(author.trim().replace(/^@/, ""))}`,
					)
					.join(" OR ")})`,
			);
		if (input.reviewer)
			filters.push(`reviewers.uuid=${JSON.stringify(input.reviewer)}`);
		if (filters.length) params.set("q", filters.join(" AND "));
		const data = await this.api.request<{
			values: BBPull[];
			next?: string;
			size?: number;
		}>(id, `${prefix}?${params}`);
		return {
			items: data.values.map((p) => bbPR(p, r, id)),
			totalCount:
				data.size ?? (input.page - 1) * input.limit + data.values.length,
			nextCursor: nextPath(data.next, "https://api.bitbucket.org/2.0", prefix),
		};
	}
	async defaultBranch(id: string, r: ForkRepositoryRef) {
		this.assert(id, r);
		if (r.provider === "github")
			return (await this.api.request<GHRepo>(id, repoPath(r))).default_branch;
		return (
			(await this.api.request<BBRepo>(id, repoPath(r))).mainbranch?.name ?? null
		);
	}
	async forBranch(
		id: string,
		r: ForkRepositoryRef,
		branch: string,
		target?: string,
	): Promise<ForkPullRequest | null> {
		this.assert(id, r);
		if (r.provider === "bitbucket") {
			const query = new URLSearchParams({
				state: "OPEN",
				q: `source.branch.name=${JSON.stringify(branch)}${target ? ` AND destination.branch.name=${JSON.stringify(target)}` : ""}`,
				pagelen: "1",
				sort: "-updated_on",
			});
			const page = await this.api.request<{ values: BBPull[] }>(
				id,
				`${repoPath(r)}/pullrequests?${query}`,
			);
			return page.values[0] ? bbPR(page.values[0], r, id) : null;
		}
		const query = new URLSearchParams({
			state: "open",
			head: `${r.owner}:${branch}`,
			...(target ? { base: target } : {}),
			per_page: "1",
		});
		const page = await this.api.request<GHPull[]>(
			id,
			`${repoPath(r)}/pulls?${query}`,
		);
		return page[0] ? ghPR(page[0], r, id) : null;
	}
	assert(id: string, repository?: ForkRepositoryRef) {
		const c = this.api.connection(id);
		if (
			c.provider === "jira" ||
			(repository &&
				(repository.provider !== c.provider ||
					repository.host !== FORK_PROVIDER_DEFINITIONS[c.provider].host))
		)
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "The connection does not match this repository",
			});
		return c;
	}
	async repositories(
		id: string,
		cursor?: string,
		knownWorkspaces: string[] = [],
	): Promise<ForkPage<ForkRepository>> {
		const c = this.assert(id);
		if (c.provider === "github") {
			const page = Number(cursor ?? 1);
			if (!Number.isSafeInteger(page) || page < 1 || page > 100)
				throw new TRPCError({ code: "BAD_REQUEST" });
			const rows = await this.api.request<GHRepo[]>(
				id,
				`/user/repos?per_page=100&sort=updated&page=${page}`,
			);
			return {
				items: rows.map((r) => ({
					provider: "github",
					host: "github.com",
					owner: r.owner.login,
					name: r.name,
					id: String(r.id),
					fullName: r.full_name,
					url: r.html_url,
					cloneUrl: r.clone_url,
					defaultBranch: r.default_branch,
					connectionId: id,
				})),
				nextCursor: rows.length === 100 ? String(page + 1) : null,
			};
		}
		return forkBitbucketRepositories(this.api, id, cursor, knownWorkspaces);
	}
	async list(
		id: string,
		r: ForkRepositoryRef,
		state = "open",
		cursor?: string,
	): Promise<ForkPage<ForkPullRequest>> {
		this.assert(id, r);
		if (r.provider === "github") {
			const page = Number(cursor ?? 1);
			if (!Number.isSafeInteger(page) || page < 1 || page > 100)
				throw new TRPCError({ code: "BAD_REQUEST" });
			const rows = await this.api.request<GHPull[]>(
				id,
				`${repoPath(r)}/pulls?state=${state === "all" ? "all" : state === "open" ? "open" : "closed"}&per_page=100&page=${page}&sort=updated`,
			);
			return {
				items: rows.map((p) => ghPR(p, r, id)),
				nextCursor: rows.length === 100 ? String(page + 1) : null,
			};
		}
		const prefix = `${repoPath(r)}/pullrequests`;
		if (cursor && !cursor.startsWith(`${prefix}?`))
			throw new TRPCError({ code: "BAD_REQUEST" });
		const states =
			state === "open"
				? "state=OPEN"
				: state === "all"
					? "state=OPEN&state=MERGED&state=DECLINED&state=SUPERSEDED"
					: "state=MERGED&state=DECLINED&state=SUPERSEDED";
		const data = await this.api.request<{ values: BBPull[]; next?: string }>(
			id,
			cursor ?? `${prefix}?${states}&pagelen=50&sort=-updated_on`,
		);
		return {
			items: data.values.map((p) => bbPR(p, r, id)),
			nextCursor: nextPath(data.next, "https://api.bitbucket.org/2.0", prefix),
		};
	}
	async get(
		id: string,
		r: ForkRepositoryRef,
		number: number,
	): Promise<ForkPullRequest> {
		this.assert(id, r);
		return r.provider === "github"
			? ghPR(
					await this.api.request<GHPull>(id, `${repoPath(r)}/pulls/${number}`),
					r,
					id,
				)
			: bbPR(
					await this.api.request<BBPull>(
						id,
						`${repoPath(r)}/pullrequests/${number}`,
					),
					r,
					id,
				);
	}
	async diff(id: string, r: ForkRepositoryRef, number: number) {
		this.assert(id, r);
		return forkAvailability(this.api.store).run(
			this.api.connection(id),
			async () => {
				const { base, headers } = await this.api.auth(id);
				const path =
					r.provider === "github"
						? `${repoPath(r)}/pulls/${number}`
						: `${repoPath(r)}/pullrequests/${number}/diff`;
				return forkText(base + path, {
					...headers,
					accept:
						r.provider === "github"
							? "application/vnd.github.diff"
							: "text/plain",
				});
			},
		);
	}
	async comments(
		id: string,
		r: ForkRepositoryRef,
		number: number,
		cursor?: string,
	): Promise<ForkPage<ForkComment>> {
		this.assert(id, r);
		if (r.provider === "github") {
			const page = Number(cursor ?? 1);
			if (!Number.isSafeInteger(page) || page < 1 || page > 100)
				throw new TRPCError({ code: "BAD_REQUEST" });
			const rows = await this.api.request<
				{
					id: number;
					user: { login: string };
					body: string;
					created_at: string;
				}[]
			>(
				id,
				`${repoPath(r)}/issues/${number}/comments?per_page=100&page=${page}`,
			);
			return {
				items: rows.map((c) => ({
					id: String(c.id),
					author: c.user.login,
					body: c.body,
					createdAt: c.created_at,
				})),
				nextCursor: rows.length === 100 ? String(page + 1) : null,
			};
		}
		const prefix = `${repoPath(r)}/pullrequests/${number}/comments`;
		if (cursor && !cursor.startsWith(`${prefix}?`))
			throw new TRPCError({ code: "BAD_REQUEST" });
		const d = await this.api.request<{
			values: {
				id: number;
				user: BBUser;
				content: { raw: string };
				created_on: string;
				inline?: { path: string; to?: number; from?: number };
				parent?: { id: number };
				deleted?: boolean;
				resolution?: unknown;
			}[];
			next?: string;
		}>(id, cursor ?? `${prefix}?pagelen=100`);
		return {
			items: d.values.map((c) => ({
				id: String(c.id),
				author: c.user.display_name,
				body: c.content.raw,
				createdAt: c.created_on,
				...(c.parent ? { parentId: String(c.parent.id) } : {}),
				...(c.deleted ? { deleted: true } : {}),
				...(c.resolution ? { resolved: true } : {}),
				...(c.inline
					? {
							path: c.inline.path,
							line: c.inline.to ?? c.inline.from,
							side: c.inline.to != null ? ("new" as const) : ("old" as const),
						}
					: {}),
			})),
			nextCursor: nextPath(d.next, "https://api.bitbucket.org/2.0", prefix),
		};
	}
	async checks(id: string, r: ForkRepositoryRef, number: number) {
		const pr = await this.get(id, r, number);
		if (r.provider === "github") {
			const result = await this.api.request<{
				check_runs: {
					id: number;
					name: string;
					status: string;
					conclusion: string | null;
					html_url: string;
				}[];
			}>(
				id,
				`${repoPath(r)}/commits/${part(pr.headCommit)}/check-runs?per_page=100`,
			);
			return result.check_runs.map((c) => ({
				id: String(c.id),
				name: c.name,
				state: c.conclusion ?? c.status,
				url: c.html_url,
			}));
		}
		const d = await this.api.request<{
			values: { uuid: string; name: string; state: string; url: string }[];
		}>(id, `${repoPath(r)}/pullrequests/${number}/statuses?pagelen=100`);
		return d.values.map((c) => ({
			id: c.uuid,
			name: c.name,
			state: c.state,
			url: c.url,
		}));
	}
	async create(
		id: string,
		r: ForkRepositoryRef,
		data: {
			title: string;
			description: string;
			source: string;
			target: string;
		},
	) {
		this.assert(id, r);
		if (r.provider === "github")
			return ghPR(
				await this.api.request<GHPull>(id, `${repoPath(r)}/pulls`, "POST", {
					title: data.title,
					body: data.description,
					head: data.source,
					base: data.target,
				}),
				r,
				id,
			);
		return bbPR(
			await this.api.request<BBPull>(
				id,
				`${repoPath(r)}/pullrequests`,
				"POST",
				{
					title: data.title,
					description: data.description,
					source: { branch: { name: data.source } },
					destination: { branch: { name: data.target } },
					reviewers: await this.defaultReviewers(id, r),
				},
			),
			r,
			id,
		);
	}
	/** The repository's default reviewers, without the author. */
	async defaultReviewers(
		id: string,
		r: ForkRepositoryRef,
	): Promise<{ uuid: string }[]> {
		const me = this.api.connection(id).identity?.id;
		try {
			const d = await this.api.request<{
				values: { user: { uuid: string } }[];
			}>(id, `${repoPath(r)}/effective-default-reviewers?pagelen=100`);
			return d.values
				.map((v) => ({ uuid: v.user.uuid }))
				.filter((v) => v.uuid !== me);
		} catch {
			return [];
		}
	}

	async commitChecks(
		id: string,
		r: ForkRepositoryRef,
		commit: string,
	): Promise<{
		status: "success" | "failure" | "pending" | "none";
		checks: {
			name: string;
			status: "success" | "failure" | "pending";
			url: string | null;
		}[];
	}> {
		const key = `${id}:${forkRepositoryKey(r)}:${commit}`;
		const cached = commitChecksCache.get(key);
		if (cached && Date.now() - cached.at < 60_000) return cached.value;
		const d = await this.api.request<{
			values: { key: string; name?: string; state: string; url?: string }[];
		}>(id, `${repoPath(r)}/commit/${part(commit)}/statuses?pagelen=100`);
		const checks = d.values.map((s) => ({
			name: s.name || s.key,
			status:
				s.state === "SUCCESSFUL"
					? ("success" as const)
					: s.state === "INPROGRESS"
						? ("pending" as const)
						: ("failure" as const),
			url: s.url ?? null,
		}));
		const status = checks.some((c) => c.status === "failure")
			? "failure"
			: checks.some((c) => c.status === "pending")
				? "pending"
				: checks.length
					? "success"
					: "none";
		const value = { status, checks } as const;
		if (commitChecksCache.size >= 500) {
			const oldest = commitChecksCache.keys().next().value;
			if (oldest) commitChecksCache.delete(oldest);
		}
		commitChecksCache.set(key, {
			value,
			at: Date.now(),
		});
		return value;
	}
	async diffstat(id: string, r: ForkRepositoryRef, number: number) {
		this.assert(id, r);
		const key = `${id}:${forkRepositoryKey(r)}:${number}`;
		const cached = diffstatCache.get(key);
		if (cached && Date.now() - cached.at < 60_000) return cached.value;
		const prefix = `${repoPath(r)}/pullrequests/${number}/diffstat`;
		let cursor: string | null = `${prefix}?pagelen=100`;
		let additions = 0,
			deletions = 0;
		for (let page = 0; cursor && page < 50; page++) {
			const data: {
				values: { lines_added?: number; lines_removed?: number }[];
				next?: string;
			} = await this.api.request(id, cursor);
			for (const file of data.values) {
				additions += file.lines_added ?? 0;
				deletions += file.lines_removed ?? 0;
			}
			cursor = nextPath(data.next, "https://api.bitbucket.org/2.0", [
				prefix,
				`${repoPath(r)}/diffstat/`,
			]);
		}
		if (cursor)
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Pull request has too many changed files to summarize",
			});
		const value = { additions, deletions };
		if (diffstatCache.size >= 500) {
			const oldest = diffstatCache.keys().next().value;
			if (oldest) diffstatCache.delete(oldest);
		}
		diffstatCache.set(key, { value, at: Date.now() });
		return value;
	}
	async action(
		id: string,
		r: ForkRepositoryRef,
		number: number,
		action:
			| "merge"
			| "close"
			| "reopen"
			| "approve"
			| "unapprove"
			| "request-changes"
			| "unrequest-changes"
			| "comment"
			| "reply"
			| "resolve"
			| "unresolve"
			| "edit",
		data: {
			commentId?: string;
			side?: "old" | "new";
			body?: string;
			title?: string;
			method?: string;
			head?: string;
			path?: string;
			line?: number;
		},
	) {
		this.assert(id, r);
		const path =
			repoPath(r) +
			(r.provider === "github" ? "/pulls/" : "/pullrequests/") +
			number;
		if (action === "merge") {
			const current = await this.get(id, r, number);
			if (
				!data.head ||
				current.headCommit !== data.head ||
				current.state !== "open"
			)
				throw new TRPCError({
					code: "CONFLICT",
					message: "The pull request changed. Refresh it before merging.",
				});
			return this.api.request(
				id,
				`${path}/merge`,
				r.provider === "github" ? "PUT" : "POST",
				r.provider === "github"
					? { sha: data.head, merge_method: data.method ?? "merge" }
					: { merge_strategy: data.method ?? "merge_commit" },
			);
		}
		if (action === "edit")
			return this.api.request(
				id,
				path,
				r.provider === "github" ? "PATCH" : "PUT",
				{
					title: data.title,
					[r.provider === "github" ? "body" : "description"]: data.body,
				},
			);
		if (action === "comment") {
			if (r.provider === "github")
				return this.api.request(
					id,
					`${repoPath(r)}/issues/${number}/comments`,
					"POST",
					{ body: data.body },
				);
			return this.api.request(id, `${path}/comments`, "POST", {
				content: { raw: data.body },
				...(data.path && data.line
					? {
							inline: {
								path: data.path,
								[data.side === "old" ? "from" : "to"]: data.line,
							},
						}
					: {}),
			});
		}
		if (r.provider === "bitbucket") {
			if (action === "request-changes" || action === "unrequest-changes")
				return this.api.request(
					id,
					`${path}/request-changes`,
					action === "request-changes" ? "POST" : "DELETE",
				);
			if (action === "reply")
				return this.api.request(id, `${path}/comments`, "POST", {
					content: { raw: data.body },
					parent: { id: Number(data.commentId) },
				});
			if (action === "resolve" || action === "unresolve")
				return this.api.request(
					id,
					`${path}/comments/${part(data.commentId ?? "")}/resolve`,
					action === "resolve" ? "POST" : "DELETE",
				);
		} else if (
			action === "request-changes" ||
			action === "unrequest-changes" ||
			action === "reply" ||
			action === "resolve" ||
			action === "unresolve"
		)
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Manage this review on GitHub",
			});
		if (action === "approve" || action === "unapprove") {
			if (r.provider === "github") {
				if (action === "unapprove")
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Manage this review on GitHub",
					});
				return this.api.request(id, `${path}/reviews`, "POST", {
					event: "APPROVE",
					body: data.body ?? "",
				});
			}
			return this.api.request(
				id,
				`${path}/approve`,
				action === "approve" ? "POST" : "DELETE",
			);
		}
		if (r.provider === "github")
			return this.api.request(id, path, "PATCH", {
				state: action === "close" ? "closed" : "open",
			});
		return this.api.request(
			id,
			path + (action === "close" ? "/decline" : ""),
			action === "close" ? "POST" : "PUT",
			action === "reopen" ? { state: "OPEN" } : undefined,
		);
	}
}
