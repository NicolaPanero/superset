import { TRPCError } from "@trpc/server";
import type { forkFetch } from "../../src/fork-integrations/fork-http";

interface FixtureBody {
	transition?: { id: string };
	content?: { raw: string };
	parent?: { id: number };
	inline?: { path: string; from?: number; to?: number };
}

export function forkProviderFixture() {
	const calls: {
		host: string;
		path: string;
		method: string;
		account: string;
		body: FixtureBody;
	}[] = [];
	const issues = new Map<
		string,
		{ name: string; status: string; category: string }
	>();
	const comments: (FixtureBody & {
		id: number;
		user: { display_name: string };
		created_on: string;
	})[] = [];
	const offline = new Set<string>();
	const transport = (async (raw: string | URL, init: RequestInit = {}) => {
		const url = new URL(raw);
		const auth = new Headers(init.headers).get("authorization") ?? "";
		const account = auth.startsWith("Basic ")
			? Buffer.from(auth.slice(6), "base64")
					.toString()
					.split(":")
					.slice(1)
					.join(":")
			: auth.replace(/^token |^Bearer /i, "");
		const method = init.method ?? "GET";
		const body: FixtureBody = init.body ? JSON.parse(String(init.body)) : {};
		const path = url.pathname;
		calls.push({ host: url.host, path, method, account, body });
		if (offline.has(url.host))
			throw new TRPCError({
				code: "BAD_GATEWAY",
				message: "Fixture provider offline",
			});
		if (url.host.endsWith("atlassian.net")) {
			const issue = issues.get(account) ?? {
				name: account === "jira-one" ? "Site one issue" : "Site two issue",
				status: "To Do",
				category: "new",
			};
			issues.set(account, issue);
			if (path.endsWith("/field"))
				return [
					{
						id: "customfield_9001",
						schema: { custom: "com.pyxis.greenhopper.jira:gh-sprint" },
					},
				];
			if (path.endsWith("/myself"))
				return { accountId: account, displayName: account };
			if (path.endsWith("/project/search"))
				return {
					values: [{ id: "1", key: "APP", name: "Application" }],
					isLast: true,
				};
			const fields = {
				summary: issue.name,
				description: {
					type: "doc",
					version: 1,
					content: [
						{
							type: "paragraph",
							content: [{ type: "text", text: `Description for ${account}` }],
						},
					],
				},
				status: {
					id: issue.category,
					name: issue.status,
					statusCategory: { key: issue.category },
				},
				issuetype: { name: "Bug" },
				labels: ["ready"],
				customfield_9001: [{ name: "Sprint 7", state: "active" }],
			};
			const task = { id: "10007", key: "APP-7", fields };
			if (path.endsWith("/search/jql")) return { issues: [task], isLast: true };
			if (path.endsWith("/transitions")) {
				if (method === "POST") {
					issue.status =
						body.transition?.id === "review" ? "Code Review" : "In Progress";
					issue.category = "indeterminate";
					return undefined;
				}
				return {
					transitions: [
						{
							id: "start",
							name: "Start",
							to: {
								id: "indeterminate",
								name: "In Progress",
								statusCategory: { key: "indeterminate" },
							},
							fields: {},
						},
						{
							id: "review",
							name: "Review",
							to: {
								id: "review",
								name: "Code Review",
								statusCategory: { key: "indeterminate" },
							},
							fields: {},
						},
					],
				};
			}
			if (/\/issue\/APP-7$/.test(path)) return task;
		}
		if (url.host === "api.bitbucket.org") {
			if (path.endsWith("/user"))
				return { uuid: account, display_name: account, nickname: account };
			if (path.endsWith("/effective-default-reviewers"))
				return { values: [{ user: { uuid: "{reviewer}" } }] };
			const pr = {
				id: 7,
				title: "Fix login",
				description: "Review the fix",
				state: "OPEN",
				author: { display_name: "Ada", nickname: "ada" },
				participants: [
					{ role: "REVIEWER", user: { display_name: "Bob" }, approved: false },
				],
				source: {
					branch: { name: "feature" },
					commit: { hash: "a".repeat(40) },
					repository: { full_name: "team/app" },
				},
				destination: { branch: { name: "main" } },
				updated_on: "2026-10-19T08:00:00Z",
				links: {
					html: { href: "https://bitbucket.org/team/app/pull-requests/7" },
				},
			};
			if (path.endsWith("/diffstat"))
				return { values: [{ lines_added: 11, lines_removed: 3 }] };
			if (path.endsWith("/statuses"))
				return {
					values: [
						{
							key: "build",
							name: "Build",
							state: "SUCCESSFUL",
							url: "https://bitbucket.org/build/7",
						},
					],
				};
			if (path.endsWith("/comments")) {
				if (method === "POST") {
					const c = {
						id: comments.length + 1,
						user: { display_name: "Ada" },
						content: body.content,
						parent: body.parent,
						inline: body.inline,
						created_on: "2026-10-19T08:00:00Z",
					};
					comments.push(c);
					return c;
				}
				return { values: comments };
			}
			if (/\/comments\/\d+\/resolve$/.test(path)) return {};
			if (path.endsWith("/approve") || path.endsWith("/request-changes"))
				return {};
			if (path.endsWith("/pullrequests/7")) return pr;
			if (path.endsWith("/pullrequests"))
				return method === "POST" ? pr : { values: [pr], size: 1 };
		}
		if (
			url.host === "api.github.com" &&
			/\/repos\/team\/app\/pulls$/.test(path) &&
			method === "POST"
		)
			return {
				number: 7,
				html_url: "https://github.com/team/app/pull/7",
				...body,
			};
		throw new Error(
			`Unconfigured provider fixture: ${method} ${url.host}${path}`,
		);
	}) as typeof forkFetch;
	return { transport, calls, issues, comments, offline };
}
