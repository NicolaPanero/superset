import type { ForkComment, ForkTask } from "@superset/shared/fork-integrations";
import { TRPCError } from "@trpc/server";
import type { ForkApi } from "./fork-api";
import type { ForkTaskProvider } from "./fork-provider";
import type { ForkPage } from "./fork-scm";

interface AdfNode {
	type?: string;
	text?: string;
	content?: AdfNode[];
}
export function adfText(node: AdfNode | string | null | undefined): string {
	if (!node) return "";
	if (typeof node === "string") return node;
	if (node.text) return node.text;
	const text = (node.content ?? []).map(adfText).join("");
	return ["paragraph", "heading", "listItem"].includes(node.type ?? "")
		? `${text}\n`
		: text;
}
export function textAdf(text: string) {
	return {
		type: "doc",
		version: 1,
		content: text.split("\n").map((line) => ({
			type: "paragraph",
			content: line ? [{ type: "text", text: line }] : [],
		})),
	};
}
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
	};
}
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
			description: adfText(f.description).trim(),
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
		};
	}
	async list(
		id: string,
		jql: string,
		cursor?: string,
	): Promise<ForkPage<ForkTask>> {
		this.assert(id);
		const d = await this.api.request<{
			issues: JiraIssue[];
			nextPageToken?: string;
			isLast?: boolean;
		}>(id, "/rest/api/3/search/jql", "POST", {
			jql: jql.trim() || "assignee = currentUser() ORDER BY updated DESC",
			fields: [
				"summary",
				"description",
				"status",
				"priority",
				"assignee",
				"labels",
			],
			maxResults: 50,
			...(cursor ? { nextPageToken: cursor } : {}),
		});
		return {
			items: d.issues.map((t) => this.task(id, t)),
			nextCursor: d.isLast ? null : (d.nextPageToken ?? null),
		};
	}
	async get(id: string, key: string) {
		this.assert(id);
		return this.task(
			id,
			await this.api.request<JiraIssue>(
				id,
				`/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,description,status,priority,assignee,labels`,
			),
		);
	}
	async projects(id: string) {
		this.assert(id);
		const d = await this.api.request<{
			values: { id: string; key: string; name: string }[];
		}>(id, "/rest/api/3/project/search?maxResults=100");
		return d.values;
	}
	async transitions(id: string, key: string) {
		this.assert(id);
		const d = await this.api.request<{
			transitions: {
				id: string;
				name: string;
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
			fields: Object.entries(t.fields ?? {}).map(([id, f]) => ({ id, ...f })),
		}));
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
			body: adfText(c.body).trim(),
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
				: { description: textAdf(fields.description) }),
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
			{ body: textAdf(body) },
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
