import type { ForkComment, ForkTask } from "@superset/shared/fork-integrations";
import { TRPCError } from "@trpc/server";
import { type AdfNode, adfToMarkdown, markdownToAdf } from "./fork-adf";
import type { ForkApi } from "./fork-api";
import type { ForkJiraStatusMapping } from "./fork-jira-status-mapping";
import type { ForkTaskProvider } from "./fork-provider";
import type { ForkPage } from "./fork-scm";

interface JiraIssue {
	id: string;
	key: string;
	fields: {
		summary: string;
		description?: AdfNode | null;
		status: { id: string; name: string; statusCategory?: { key: string } };
		priority?: { id: string; name: string } | null;
		assignee?: { accountId: string; displayName: string } | null;
		labels?: string[];
		issuetype?: { name: string; iconUrl?: string; subtask?: boolean };
		parent?: { key: string; fields?: { summary?: string } };
		[field: string]: unknown;
	};
}
/** The sprint field Jira Cloud creates; sites without boards just omit it. */
const SPRINT_FIELD = "customfield_10020";
const sprintFields = new Map<
	string,
	{ at: number; id: Promise<string | null> }
>();
function readSprint(value: unknown): string | null {
	if (!Array.isArray(value)) return null;
	const sprints = value.filter(
		(entry): entry is { name: string; state: string } =>
			!!entry && typeof entry === "object" && typeof entry.name === "string",
	);
	return (
		sprints.find((entry) => entry.state === "active")?.name ??
		sprints.at(-1)?.name ??
		null
	);
}
const TASK_FIELDS = [
	"summary",
	"status",
	"priority",
	"assignee",
	"labels",
	"issuetype",
	"parent",
] as const;

export class ForkJiraProvider implements ForkTaskProvider {
	constructor(readonly api: ForkApi) {}
	assert(id: string) {
		const c = this.api.connection(id);
		if (c.provider !== "jira")
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Select a Jira connection",
			});
		return c;
	}
	task(id: string, issue: JiraIssue): ForkTask {
		const c = this.assert(id),
			f = issue.fields;
		return {
			id: issue.id,
			key: issue.key,
			connectionId: id,
			title: f.summary,
			description: adfToMarkdown(f.description),
			url: `${c.site}/browse/${encodeURIComponent(issue.key)}`,
			status: {
				id: f.status.id,
				name: f.status.name,
				category: f.status.statusCategory?.key ?? "undefined",
			},
			priority: f.priority?.name ?? null,
			priorityId: f.priority?.id ?? null,
			assignee: f.assignee
				? { id: f.assignee.accountId, name: f.assignee.displayName }
				: null,
			labels: f.labels ?? [],
			type: f.issuetype
				? { name: f.issuetype.name, iconUrl: f.issuetype.iconUrl ?? null }
				: null,
			parent: f.parent
				? { key: f.parent.key, title: f.parent.fields?.summary ?? "" }
				: null,
			sprint: readSprint(f[SPRINT_FIELD]),
		};
	}
	async sprintField(id: string): Promise<string | null> {
		const key = `${this.api.connection(id).site}:${id}`;
		const cached = sprintFields.get(key);
		if (cached && Date.now() - cached.at < 3600_000) return cached.id;
		const field = this.api
			.request<{ id: string; schema?: { custom?: string } }[]>(
				id,
				"/rest/api/3/field",
			)
			.then((fields) =>
				Array.isArray(fields)
					? (fields.find(
							(f) =>
								f.schema?.custom === "com.pyxis.greenhopper.jira:gh-sprint",
						)?.id ?? null)
					: null,
			)
			.catch(() => null);
		if (sprintFields.size >= 100) {
			const oldest = sprintFields.keys().next().value;
			if (oldest) sprintFields.delete(oldest);
		}
		sprintFields.set(key, { at: Date.now(), id: field });
		return field;
	}
	async list(
		id: string,
		jql: string,
		cursor?: string,
	): Promise<ForkPage<ForkTask>> {
		this.assert(id);
		const sprintField = await this.sprintField(id);
		const d = await this.api.request<{
			issues: JiraIssue[];
			nextPageToken?: string;
			isLast?: boolean;
		}>(id, "/rest/api/3/search/jql", "POST", {
			jql: jql.trim() || "assignee = currentUser() ORDER BY updated DESC",
			fields: [...TASK_FIELDS, ...(sprintField ? [sprintField] : [])],
			maxResults: 50,
			...(cursor ? { nextPageToken: cursor } : {}),
		});
		return {
			items: d.issues.map((t) =>
				this.task(id, {
					...t,
					fields: {
						...t.fields,
						[SPRINT_FIELD]: sprintField ? t.fields[sprintField] : undefined,
					},
				}),
			),
			nextCursor: d.isLast ? null : (d.nextPageToken ?? null),
		};
	}
	async get(id: string, key: string) {
		this.assert(id);
		const sprintField = await this.sprintField(id);
		const issue = await this.api.request<JiraIssue>(
			id,
			`/rest/api/3/issue/${encodeURIComponent(key)}?fields=description,${[...TASK_FIELDS, ...(sprintField ? [sprintField] : [])].join(",")}`,
		);
		return this.task(id, {
			...issue,
			fields: {
				...issue.fields,
				[SPRINT_FIELD]: sprintField ? issue.fields[sprintField] : undefined,
			},
		});
	}
	async projects(id: string) {
		this.assert(id);
		const projects: { id: string; key: string; name: string }[] = [];
		for (let startAt = 0; startAt < 1000; startAt += 100) {
			const d = await this.api.request<{
				values: { id: string; key: string; name: string }[];
				isLast?: boolean;
			}>(id, `/rest/api/3/project/search?maxResults=100&startAt=${startAt}`);
			projects.push(...d.values);
			if (d.isLast !== false || d.values.length === 0) break;
		}
		return projects;
	}
	async transitions(id: string, key: string) {
		this.assert(id);
		const d = await this.api.request<{
			transitions: {
				id: string;
				name: string;
				to?: { id: string; name: string; statusCategory?: { key: string } };
				fields?: Record<
					string,
					{
						name: string;
						required: boolean;
						schema?: { type: string; items?: string };
						allowedValues?: { id?: string; name?: string; value?: string }[];
					}
				>;
			}[];
		}>(
			id,
			`/rest/api/3/issue/${encodeURIComponent(key)}/transitions?expand=transitions.fields`,
		);
		return d.transitions.map((t) => ({
			id: t.id,
			name: t.name,
			to: t.to
				? {
						id: t.to.id,
						name: t.to.name,
						category: t.to.statusCategory?.key ?? "undefined",
					}
				: null,
			fields: Object.entries(t.fields ?? {}).map(([id, f]) => ({ id, ...f })),
		}));
	}
	/**
	 * Moves an issue forward without asking: to work in progress when work
	 * starts, to a review status when a pull request opens. Transitions that
	 * need input are skipped, so a site's own workflow rules stay in charge.
	 */
	async advance(
		id: string,
		key: string,
		target: "progress" | "review",
		mapping?: ForkJiraStatusMapping | null,
	): Promise<boolean> {
		const issue = await this.get(id, key);
		const mapped =
			target === "progress"
				? mapping?.progressStatusId
				: mapping?.reviewStatusId;
		if (issue.status.category === "done") return false;
		if (mapped && issue.status.id === mapped) return false;
		if (target === "progress" && issue.status.category !== "new") return false;
		if (target === "review" && !mapped && /review/i.test(issue.status.name))
			return false;
		const d = await this.api.request<{
			transitions: {
				id: string;
				to: { id: string; name: string; statusCategory?: { key: string } };
				fields?: Record<string, { required?: boolean }>;
			}[];
		}>(
			id,
			`/rest/api/3/issue/${encodeURIComponent(key)}/transitions?expand=transitions.fields`,
		);
		const usable = d.transitions.filter(
			(t) => !Object.values(t.fields ?? {}).some((f) => f.required),
		);
		const pick = mapped
			? usable.find((t) => t.to.id === mapped)
			: target === "progress"
				? usable.find(
						(t) =>
							t.to.statusCategory?.key === "indeterminate" &&
							!/review/i.test(t.to.name),
					)
				: usable.find(
						(t) =>
							/review/i.test(t.to.name) && t.to.statusCategory?.key !== "done",
					);
		if (!pick) return false;
		await this.api.request(
			id,
			`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`,
			"POST",
			{ transition: { id: pick.id } },
		);
		return true;
	}
	/** Statuses used by any issue type of a project, without duplicates. */
	async projectStatuses(
		id: string,
		projectKey: string,
	): Promise<{ id: string; name: string; category: string }[]> {
		this.assert(id);
		const types = await this.api.request<
			{
				statuses: {
					id: string;
					name: string;
					statusCategory?: { key: string };
				}[];
			}[]
		>(id, `/rest/api/3/project/${encodeURIComponent(projectKey)}/statuses`);
		const statuses = new Map<
			string,
			{ id: string; name: string; category: string }
		>();
		for (const type of types)
			for (const status of type.statuses)
				statuses.set(status.id, {
					id: status.id,
					name: status.name,
					category: status.statusCategory?.key ?? "undefined",
				});
		return [...statuses.values()];
	}
	async editMetadata(id: string, key: string) {
		this.assert(id);
		const data = await this.api.request<{
			fields: Record<
				string,
				{ allowedValues?: { id: string; name: string }[] }
			>;
		}>(id, `/rest/api/3/issue/${encodeURIComponent(key)}/editmeta`);
		return {
			priorities: data.fields.priority?.allowedValues ?? [],
			canAssign: !!data.fields.assignee,
		};
	}
	async assignees(id: string, key: string, query: string) {
		this.assert(id);
		const users = await this.api.request<
			{ accountId: string; displayName: string }[]
		>(
			id,
			`/rest/api/3/user/assignable/search?issueKey=${encodeURIComponent(key)}&query=${encodeURIComponent(query)}&maxResults=50`,
		);
		return users.map((u) => ({ id: u.accountId, name: u.displayName }));
	}
	async comments(id: string, key: string): Promise<ForkComment[]> {
		this.assert(id);
		const d = await this.api.request<{
			comments: {
				id: string;
				author: { displayName: string };
				body: AdfNode;
				created: string;
			}[];
		}>(
			id,
			`/rest/api/3/issue/${encodeURIComponent(key)}/comment?maxResults=100&orderBy=-created`,
		);
		return d.comments.map((c) => ({
			id: c.id,
			author: c.author.displayName,
			body: adfToMarkdown(c.body),
			createdAt: c.created,
		}));
	}
	async edit(
		id: string,
		key: string,
		fields: {
			title?: string;
			description?: string;
			assigneeId?: string | null;
			priorityId?: string;
			labels?: string[];
		},
	) {
		this.assert(id);
		const payload = {
			...(fields.title === undefined ? {} : { summary: fields.title }),
			...(fields.description === undefined
				? {}
				: { description: markdownToAdf(fields.description) }),
			...(fields.assigneeId === undefined
				? {}
				: {
						assignee: fields.assigneeId
							? { accountId: fields.assigneeId }
							: null,
					}),
			...(fields.priorityId === undefined
				? {}
				: { priority: { id: fields.priorityId } }),
			...(fields.labels === undefined ? {} : { labels: fields.labels }),
		};
		await this.api.request(
			id,
			`/rest/api/3/issue/${encodeURIComponent(key)}`,
			"PUT",
			{ fields: payload },
		);
		return this.get(id, key);
	}
	async transition(
		id: string,
		key: string,
		transitionId: string,
		fields: Record<string, unknown>,
	) {
		this.assert(id);
		await this.api.request(
			id,
			`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`,
			"POST",
			{ transition: { id: transitionId }, fields },
		);
		return this.get(id, key);
	}
	async comment(id: string, key: string, body: string) {
		this.assert(id);
		await this.api.request(
			id,
			`/rest/api/3/issue/${encodeURIComponent(key)}/comment`,
			"POST",
			{ body: markdownToAdf(body) },
		);
		return { ok: true };
	}
	async remove(id: string, key: string) {
		this.assert(id);
		await this.api.request(
			id,
			`/rest/api/3/issue/${encodeURIComponent(key)}`,
			"DELETE",
		);
		return { ok: true };
	}
}
