import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { HostDb } from "../db";
import {
	forkIntegrationBindings,
	forkIntegrationConnections,
	forkWorkspacePullRequests,
} from "../db/fork-schema";
import { ensureForkTables } from "../db/fork-tables";
import type { GitCredentialProvider } from "../runtime/git";
import { adfToMarkdown, markdownToAdf } from "./fork-adf";
import { ForkApi } from "./fork-api";
import { ForkGitCredentialProvider } from "./fork-credentials";
import type { forkFetch } from "./fork-http";
import { ForkJiraProvider } from "./fork-jira";
import {
	discoverForkBroker,
	forkAccessSecret,
	forkOAuthStatus,
	startForkOAuth,
} from "./fork-oauth";
import { ForkScmProvider } from "./fork-scm";
import { forkWithBitbucketPullRequests } from "./fork-sidebar-pull-requests";
import { ForkConnectionStore } from "./fork-store";

function fixture(scope = "owner") {
	const sqlite = new Database(":memory:");
	sqlite.exec(
		"CREATE TABLE projects (id text PRIMARY KEY, repo_path text); CREATE TABLE workspaces (id text PRIMARY KEY, project_id text, worktree_path text);",
	);
	ensureForkTables(sqlite);
	const db = drizzle(sqlite) as unknown as HostDb;
	return { sqlite, db, store: new ForkConnectionStore(db, scope) };
}
const fallback: GitCredentialProvider = {
	getToken: async () => "system-test-token",
	getCredentials: async () => ({ env: { EXISTING_HELPER: "yes" } }),
	credentialRemedy: () => "Reconnect",
};
test("offline verification preserves Bitbucket and Jira identity, state and secrets", async () => {
	const { sqlite, store } = fixture();
	try {
		for (const provider of ["bitbucket", "jira"] as const) {
			const connection = store.save(
				{
					...store.create(provider, "token", "https://team.atlassian.net"),
					state: "connected",
					identity: { id: "user", login: "ada", name: "Ada", avatarUrl: null },
					verifiedAt: 1000,
				},
				{ token: "saved-token", email: "test@example.test" },
			);
			const before = store.get(connection.id);
			const api = new ForkApi(store, fallback, (async () => {
				throw new TRPCError({
					code: "BAD_GATEWAY",
					message: "The service could not be reached",
				});
			}) as typeof forkFetch);
			const result = await api.verify(connection.id);
			expect(result.state).toBe("connected");
			expect(result.error).toBe("The service could not be reached");
			expect(store.get(connection.id)).toEqual(before);
		}
	} finally {
		sqlite.close();
	}
});
test("connections isolate scopes, seal secrets and remove credentials on disconnect", () => {
	const { sqlite, db, store } = fixture();
	try {
		const c = store.create("bitbucket", "token", null);
		store.save(c, { token: "private-test-token", email: "test@example.test" });
		expect(store.get(c.id)?.secret.token).toBe("private-test-token");
		expect(
			JSON.stringify(db.select().from(forkIntegrationConnections).all()),
		).not.toContain("private-test-token");
		expect(new ForkConnectionStore(db, "someone-else").get(c.id)).toBeNull();
		store.disconnect(c.id);
		expect(store.get(c.id)?.secret).toEqual({});
		expect(store.get(c.id)?.connection.enabled).toBe(false);
	} finally {
		sqlite.close();
	}
});
test("Bitbucket HTTPS uses its own credential while SSH keeps the existing transport", async () => {
	const { sqlite, store } = fixture();
	try {
		const c = store.create("bitbucket", "token", null);
		store.save(c, {
			token: "bitbucket-test-token",
			email: "test@example.test",
		});
		const credentials = new ForkGitCredentialProvider(
			fallback,
			store,
			undefined,
			async () => ({ PATH: "/test-path" }),
		);
		const https = await credentials.getCredentials(
			"https://bitbucket.org/company/repo.git",
		);
		expect(https.env.GIT_CONFIG_VALUE_1).toBe(
			"Authorization: Basic " +
				Buffer.from("x-bitbucket-api-token-auth:bitbucket-test-token").toString(
					"base64",
				),
		);
		expect(
			await credentials.getCredentials("git@bitbucket.org:company/repo.git"),
		).toEqual({ env: { EXISTING_HELPER: "yes" } });
		expect(
			await credentials.getCredentials(
				"git@ssh.bitbucket.org:company/repo.git",
			),
		).toEqual({ env: { EXISTING_HELPER: "yes" } });
		store.disconnect(c.id);
		expect(await credentials.getToken("bitbucket.org")).toBeNull();
	} finally {
		sqlite.close();
	}
});
test("provider validation prevents credentials from crossing repository hosts", async () => {
	const { sqlite, store } = fixture();
	try {
		const c = store.create("bitbucket", "token", null);
		store.save(c, { token: "test" });
		const scm = new ForkScmProvider(new ForkApi(store, fallback));
		expect(() =>
			scm.assert(c.id, {
				provider: "github",
				host: "github.com",
				owner: "org",
				name: "repo",
			}),
		).toThrow();
	} finally {
		sqlite.close();
	}
});

test("Bitbucket repository discovery pages workspaces and repositories through current APIs", async () => {
	const { sqlite, store } = fixture();
	try {
		const c = store.create("bitbucket", "token", null);
		store.save(c, { token: "test", email: "user@example.test" });
		const paths: string[] = [];
		const transport: typeof forkFetch = async <T>(url: string | URL) => {
			const target = new URL(url);
			paths.push(target.pathname);
			if (target.pathname === "/2.0/user/workspaces")
				return {
					values: [
						{ workspace: { slug: "team" } },
						{ workspace: { slug: "other" } },
					],
				} as T;
			return {
				values: [
					{
						uuid: "repo",
						full_name: "team/app",
						slug: "app",
						links: {
							html: { href: "https://bitbucket.org/team/app" },
							clone: [],
						},
					},
				],
				next: target.searchParams.get("page") === "1" ? "next" : undefined,
			} as T;
		};
		const scm = new ForkScmProvider(new ForkApi(store, fallback, transport));
		const first = await scm.repositories(c.id);
		expect(first.items[0]).toMatchObject({
			fullName: "team/app",
			connectionId: c.id,
		});
		expect(first.nextCursor).toBe("bb:1:0:2");
		const second = await scm.repositories(c.id, first.nextCursor ?? undefined);
		expect(second.nextCursor).toBe("bb:1:1:1");
		expect(paths).toEqual([
			"/2.0/user/workspaces",
			"/2.0/repositories/team",
			"/2.0/user/workspaces",
			"/2.0/repositories/team",
		]);
	} finally {
		sqlite.close();
	}
});

test("repository-only Bitbucket tokens can list repositories in known workspaces", async () => {
	const { sqlite, store } = fixture();
	try {
		const c = store.create("bitbucket", "token", null);
		store.save(c, { token: "test", email: "user@example.test" });
		const transport: typeof forkFetch = async <T>(url: string | URL) => {
			const path = new URL(url).pathname;
			if (path === "/2.0/user/workspaces")
				throw new TRPCError({ code: "FORBIDDEN" });
			expect(path).toBe("/2.0/repositories/team");
			return {
				values: [
					{
						uuid: "repo",
						full_name: "team/app",
						slug: "app",
						links: {
							html: { href: "https://bitbucket.org/team/app" },
							clone: [],
						},
					},
				],
			} as T;
		};
		const scm = new ForkScmProvider(new ForkApi(store, fallback, transport));
		const result = await scm.repositories(c.id, undefined, ["team"]);
		expect(result.items[0]?.cloneUrl).toBe(
			"https://bitbucket.org/team/app.git",
		);
		expect(result.nextCursor).toBeNull();
	} finally {
		sqlite.close();
	}
});

test("a project's bound Bitbucket account leaves its GitHub remote on GitHub credentials", async () => {
	const { sqlite, db, store } = fixture();
	try {
		const connection = store.create("bitbucket", "token", null);
		store.save(connection, { token: "bb-token", email: "user@example.test" });
		sqlite.exec(
			"INSERT INTO projects (id, repo_path) VALUES ('project', '/project')",
		);
		db.insert(forkIntegrationBindings)
			.values({
				scope: store.scope,
				projectId: "project",
				connectionId: connection.id,
				remote: "origin",
				repository: {
					provider: "bitbucket",
					host: "bitbucket.org",
					owner: "team",
					name: "app",
				},
			})
			.run();
		const credentials = new ForkGitCredentialProvider(fallback, store).forPath(
			"/project",
		);
		expect(await credentials.getToken("bitbucket.org")).toBe("bb-token");
		expect(await credentials.getToken("github.com")).toBe("system-test-token");
	} finally {
		sqlite.close();
	}
});

test("Bitbucket search sends state, text and page filters to the API", async () => {
	const { sqlite, store } = fixture();
	try {
		const c = store.create("bitbucket", "token", null);
		store.save(c, { token: "test", email: "user@example.test" });
		let requested: URL | undefined;
		const transport: typeof forkFetch = async <T>(url: string | URL) => {
			requested = new URL(url);
			return { values: [], size: 0 } as T;
		};
		const scm = new ForkScmProvider(new ForkApi(store, fallback, transport));
		await scm.searchBitbucket(
			c.id,
			{
				provider: "bitbucket",
				host: "bitbucket.org",
				owner: "team",
				name: "app",
			},
			{ query: 'fix" OR state="OPEN', mergedOnly: true, page: 2, limit: 30 },
		);
		expect(requested?.searchParams.getAll("state")).toEqual(["MERGED"]);
		expect(requested?.searchParams.get("page")).toBe("2");
		expect(requested?.searchParams.get("q")).toContain(
			'title~"fix\\" OR state=\\"OPEN"',
		);
	} finally {
		sqlite.close();
	}
});
test("merging a changed PR fails before the write request", async () => {
	const { sqlite, store } = fixture();
	const calls: string[] = [];
	const transport = (async (url: string, init: RequestInit) => {
		calls.push(init.method ?? "GET");
		return {
			id: 7,
			title: "PR",
			description: "",
			state: "OPEN",
			author: { display_name: "Dev" },
			source: { branch: { name: "feature" }, commit: { hash: "changed" } },
			destination: { branch: { name: "main" } },
			updated_on: "",
			links: { html: { href: url } },
		};
	}) as typeof forkFetch;
	try {
		const c = store.create("bitbucket", "token", null);
		store.save(c, { token: "test" });
		const scm = new ForkScmProvider(new ForkApi(store, fallback, transport));
		await expect(
			scm.action(
				c.id,
				{
					provider: "bitbucket",
					host: "bitbucket.org",
					owner: "org",
					name: "repo",
				},
				7,
				"merge",
				{ head: "old" },
			),
		).rejects.toThrow("changed");
		expect(calls).toEqual(["GET"]);
	} finally {
		sqlite.close();
	}
});
test("a scoped Jira token moves to the cloud gateway after the site rejects it", async () => {
	const { sqlite, store } = fixture();
	const urls: string[] = [];
	const transport = (async (url: string) => {
		urls.push(String(url));
		if (String(url).startsWith("https://example.atlassian.net"))
			throw new TRPCError({ code: "UNAUTHORIZED" });
		return { accountId: "a", displayName: "Ada" };
	}) as typeof forkFetch;
	try {
		const c = store.create("jira", "token", "https://example.atlassian.net");
		store.save(c, {
			token: "scoped",
			email: "test@example.test",
			cloudId: "cloud-scoped",
		});
		const api = new ForkApi(store, fallback, transport);
		await api.request(c.id, "/rest/api/3/myself");
		await api.request(c.id, "/rest/api/3/myself");
		expect(urls).toEqual([
			"https://example.atlassian.net/rest/api/3/myself",
			"https://api.atlassian.com/ex/jira/cloud-scoped/rest/api/3/myself",
			"https://api.atlassian.com/ex/jira/cloud-scoped/rest/api/3/myself",
		]);
	} finally {
		sqlite.close();
	}
});
test("Jira writes use official issue endpoints and ADF without importing native tasks", async () => {
	const { sqlite, store } = fixture();
	const calls: { url: string; method?: string; body: unknown }[] = [];
	const transport = (async (url: string, init: RequestInit) => {
		calls.push({
			url,
			method: init.method,
			body: init.body ? JSON.parse(String(init.body)) : undefined,
		});
		return undefined;
	}) as typeof forkFetch;
	try {
		const c = store.create("jira", "token", "https://example.atlassian.net");
		store.save(c, {
			token: "test",
			email: "test@example.test",
			cloudId: "cloud-test",
		});
		const jira = new ForkJiraProvider(new ForkApi(store, fallback, transport));
		await jira.comment(c.id, "APP-1", "First\nSecond");
		expect(calls[0]?.url).toBe(
			"https://example.atlassian.net/rest/api/3/issue/APP-1/comment",
		);
		expect(adfToMarkdown(markdownToAdf("First\nSecond"))).toBe("First\nSecond");
	} finally {
		sqlite.close();
	}
});
test("a common OAuth broker returns two grants through a bound one-time desktop exchange", async () => {
	const { sqlite, store } = fixture();
	let base = "",
		used = false,
		verified = false;
	const broker = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: async (request) => {
			const url = new URL(request.url);
			if (url.pathname === "/.well-known/superset-oauth")
				return Response.json({
					version: 1,
					providers: ["jira", "bitbucket"],
					authorization_endpoint: `${base}/authorize`,
					token_endpoint: `${base}/token`,
				});
			if (url.pathname === "/token") {
				const payload = (await request.json()) as {
					code: string;
					code_verifier: string;
					redirect_uri: string;
				};
				if (used || payload.code !== "one-time-test")
					return new Response(null, { status: 400 });
				used = true;
				verified =
					payload.code_verifier.length > 30 &&
					new URL(payload.redirect_uri).hostname === "127.0.0.1";
				return Response.json({
					connections: [
						{
							provider: "jira",
							access_token: "jira-access-test",
							refresh_token: "jira-broker-session",
							expires_in: 3600,
							site: "https://example.atlassian.net",
							cloud_id: "cloud-test",
						},
						{
							provider: "bitbucket",
							access_token: "bb-access-test",
							refresh_token: "bb-broker-session",
							expires_in: 3600,
						},
					],
				});
			}
			return new Response(null, { status: 404 });
		},
	});
	base = `http://127.0.0.1:${broker.port}`;
	try {
		expect((await discoverForkBroker(base)).providers).toEqual([
			"jira",
			"bitbucket",
		]);
		const result = await startForkOAuth(store, base, ["jira", "bitbucket"]);
		const authorization = new URL(result.url),
			redirect = new URL(authorization.searchParams.get("redirect_uri") ?? "");
		redirect.searchParams.set(
			"state",
			authorization.searchParams.get("state") ?? "",
		);
		redirect.searchParams.set("code", "one-time-test");
		const invalid = new URL(redirect);
		invalid.searchParams.set("state", "wrong");
		expect((await fetch(invalid)).status).toBe(400);
		expect(used).toBe(false);
		const response = await fetch(redirect);
		expect(response.ok).toBe(true);
		expect(verified).toBe(true);
		expect(forkOAuthStatus("wrong-owner", result.attemptId).status).toBe(
			"error",
		);
		expect(forkOAuthStatus(store.scope, result.attemptId).status).toBe(
			"complete",
		);
		expect(
			store
				.list()
				.map((c) => c.provider)
				.sort(),
		).toEqual(["bitbucket", "jira"]);
	} finally {
		broker.stop(true);
		sqlite.close();
	}
});

test("adding a second account keeps the account in use as the default", async () => {
	const { sqlite, store } = fixture();
	try {
		const first = store.create("bitbucket", "token", null);
		store.save(first, { token: "first-test" });
		store.keepDefaultBefore("bitbucket");
		store.save(store.create("bitbucket", "token", null), {
			token: "second-test",
		});
		const credentials = new ForkGitCredentialProvider(
			fallback,
			store,
			undefined,
			async () => ({}),
		);
		expect(credentials.select("bitbucket")?.id).toBe(first.id);
		expect(await credentials.getToken("bitbucket.org")).toBe("first-test");
	} finally {
		sqlite.close();
	}
});

test("explicit repository accounts and the system default cannot fall back to a different identity", async () => {
	const { sqlite, store } = fixture();
	try {
		const first = store.create("github", "token", null),
			second = store.create("github", "token", null);
		store.save(first, { token: "first-test" });
		store.save(second, { token: "second-test" });
		const credentials = new ForkGitCredentialProvider(
			fallback,
			store,
			undefined,
			async () => ({}),
		);
		expect(() => credentials.select("github")).toThrow("default");
		const system = new ForkApi(store, fallback).connection("system:github");
		store.save({ ...system, isDefault: true });
		expect(await credentials.getToken("github.com")).toBe("system-test-token");
		store.disconnect(second.id);
		expect(await credentials.getToken("github.com")).toBe("system-test-token");
		store.disconnect(system.id);
		expect(await credentials.getToken("github.com")).toBeNull();
		const explicit = new ForkGitCredentialProvider(
			fallback,
			store,
			first.id,
			async () => ({}),
		);
		expect(await explicit.getToken("github.com")).toBe("first-test");
		store.disconnect(first.id);
		expect(
			(await explicit.getCredentials("https://github.com/org/repo.git")).env
				.GIT_CONFIG_VALUE_1,
		).toBe("");
	} finally {
		sqlite.close();
	}
});
test("concurrent OAuth refreshes rotate one broker session and keep upstream tokens off metadata", async () => {
	const { sqlite, store } = fixture();
	let base = "",
		refreshCount = 0;
	const broker = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: async (request) => {
			const path = new URL(request.url).pathname;
			if (path === "/.well-known/superset-oauth")
				return Response.json({
					version: 1,
					providers: ["bitbucket"],
					authorization_endpoint: `${base}/authorize`,
					token_endpoint: `${base}/token`,
				});
			if (path === "/token") {
				const payload = (await request.json()) as {
					refresh_token: string;
					provider: string;
				};
				if (
					payload.refresh_token !== "old-session" ||
					payload.provider !== "bitbucket"
				)
					return new Response(null, { status: 401 });
				refreshCount++;
				return Response.json({
					provider: "bitbucket",
					access_token: "rotated-test-access",
					refresh_token: "rotated-test-session",
					expires_in: 3600,
				});
			}
			return new Response(null, { status: 404 });
		},
	});
	base = `http://127.0.0.1:${broker.port}`;
	try {
		const connection = store.create("bitbucket", "oauth", null);
		store.save(
			{ ...connection, brokerUrl: base, expiresAt: 1 },
			{ token: "old-access", refreshToken: "old-session" },
		);
		const results = await Promise.all([
			forkAccessSecret(store, connection.id),
			forkAccessSecret(store, connection.id),
		]);
		expect(refreshCount).toBe(1);
		expect(results.map((r) => r.token)).toEqual([
			"rotated-test-access",
			"rotated-test-access",
		]);
		expect(store.get(connection.id)?.secret.refreshToken).toBe(
			"rotated-test-session",
		);
		expect(JSON.stringify(store.list())).not.toContain("rotated-test");
	} finally {
		broker.stop(true);
		sqlite.close();
	}
});

test("git with only a remote URL uses the account its project is bound to", async () => {
	const { sqlite, store, db } = fixture();
	try {
		const primary = store.create("bitbucket", "token", null);
		store.save(primary, { token: "default-test" });
		store.keepDefaultBefore("bitbucket");
		const bound = store.create("bitbucket", "token", null);
		store.save(bound, { token: "bound-test" });
		db.insert(forkIntegrationBindings)
			.values({
				scope: store.scope,
				projectId: "project-a",
				connectionId: bound.id,
				repository: {
					provider: "bitbucket",
					host: "bitbucket.org",
					owner: "org",
					name: "repo",
				},
				remote: "origin",
			})
			.run();
		const credentials = new ForkGitCredentialProvider(
			fallback,
			store,
			undefined,
			async () => ({}),
		);
		const header = (url: string) =>
			credentials.getCredentials(url).then((c) => c.env.GIT_CONFIG_VALUE_1);
		expect(await header("https://bitbucket.org/org/repo.git")).toContain(
			Buffer.from("x-bitbucket-api-token-auth:bound-test").toString("base64"),
		);
		expect(await header("https://bitbucket.org/org/other.git")).toContain(
			Buffer.from("x-bitbucket-api-token-auth:default-test").toString("base64"),
		);
	} finally {
		sqlite.close();
	}
});

test("separate checkouts of one repository retain their selected accounts", async () => {
	const { sqlite, store, db } = fixture();
	try {
		sqlite.exec(
			"INSERT INTO projects VALUES ('project-a', '/checkout-a'), ('project-b', '/checkout-b'); INSERT INTO workspaces VALUES ('workspace-a', 'project-a', '/worktree-a');",
		);
		const first = store.create("bitbucket", "token", null),
			second = store.create("bitbucket", "token", null);
		store.save(first, { token: "first-test" });
		store.save(second, { token: "second-test" });
		const repository = {
			provider: "bitbucket" as const,
			host: "bitbucket.org",
			owner: "org",
			name: "repo",
		};
		db.insert(forkIntegrationBindings)
			.values([
				{
					scope: store.scope,
					projectId: "project-a",
					connectionId: first.id,
					repository,
					remote: "origin",
				},
				{
					scope: store.scope,
					projectId: "project-b",
					connectionId: second.id,
					repository,
					remote: "origin",
				},
			])
			.run();
		const credentials = new ForkGitCredentialProvider(
			fallback,
			store,
			undefined,
			async () => ({}),
		);
		expect(
			await credentials.forPath("/checkout-a").getToken("bitbucket.org"),
		).toBe("first-test");
		expect(
			await credentials.forPath("/checkout-b").getToken("bitbucket.org"),
		).toBe("second-test");
		expect(
			await credentials.forPath("/worktree-a").getToken("bitbucket.org"),
		).toBe("first-test");
		expect(
			(await credentials.getCredentials("https://bitbucket.org/org/repo.git"))
				.env.GIT_CONFIG_VALUE_1,
		).toBe("");
	} finally {
		sqlite.close();
	}
});

test("a delayed account check cannot reconnect an account after disconnect", async () => {
	const { sqlite, store } = fixture();
	let release!: (value: unknown) => void, entered!: () => void;
	const ready = new Promise<void>((resolve) => {
		entered = resolve;
	});
	const transport = (async () => {
		entered();
		return new Promise<unknown>((resolve) => {
			release = resolve;
		});
	}) as typeof forkFetch;
	try {
		const connection = store.create("github", "token", null);
		store.save(connection, { token: "test-token" });
		const check = new ForkApi(store, fallback, transport).verify(connection.id);
		await ready;
		store.disconnect(connection.id);
		release({
			id: 1,
			login: "old-identity",
			name: "Old identity",
			avatar_url: "",
		});
		expect((await check).enabled).toBe(false);
		expect(store.get(connection.id)?.secret).toEqual({});
	} finally {
		sqlite.close();
	}
});

test("starting work and opening a review move a Jira issue only through input-free transitions", async () => {
	const { sqlite, store } = fixture();
	const posted: unknown[] = [];
	let status = { name: "To Do", category: "new" };
	const transport = (async (url: string, init: RequestInit) => {
		if (init.method === "POST") {
			posted.push(JSON.parse(String(init.body)));
			return undefined;
		}
		if (String(url).includes("/transitions"))
			return {
				transitions: [
					{
						id: "needs-input",
						to: {
							name: "In Progress",
							statusCategory: { key: "indeterminate" },
						},
						fields: { resolution: { required: true } },
					},
					{
						id: "start",
						to: {
							name: "In Progress",
							statusCategory: { key: "indeterminate" },
						},
					},
					{
						id: "review",
						to: {
							name: "Code Review",
							statusCategory: { key: "indeterminate" },
						},
					},
				],
			};
		return {
			id: "1",
			key: "APP-1",
			fields: {
				summary: "Title",
				status: {
					id: "s",
					name: status.name,
					statusCategory: { key: status.category },
				},
			},
		};
	}) as typeof forkFetch;
	try {
		const c = store.create("jira", "token", "https://example.atlassian.net");
		store.save(c, { token: "t", email: "test@example.test" });
		const jira = new ForkJiraProvider(new ForkApi(store, fallback, transport));
		expect(await jira.advance(c.id, "APP-1", "progress")).toBe(true);
		status = { name: "In Progress", category: "indeterminate" };
		expect(await jira.advance(c.id, "APP-1", "progress")).toBe(false);
		expect(await jira.advance(c.id, "APP-1", "review")).toBe(true);
		expect(posted).toEqual([
			{ transition: { id: "start" } },
			{ transition: { id: "review" } },
		]);
	} finally {
		sqlite.close();
	}
});

test("the sidebar shows a linked Bitbucket pull request where GitHub has none", () => {
	const { sqlite, db, store } = fixture();
	try {
		sqlite.exec(
			"INSERT INTO workspaces VALUES ('ws-1', 'project-a', '/worktree')",
		);
		const repository = {
			provider: "bitbucket" as const,
			host: "bitbucket.org",
			owner: "org",
			name: "repo",
		};
		db.insert(forkWorkspacePullRequests)
			.values({
				scope: store.scope,
				workspaceId: "ws-1",
				pullRequest: {
					repository,
					connectionId: "bb",
					number: 7,
					title: "Fix",
					description: "",
					url: "https://bitbucket.org/org/repo/pull-requests/7",
					state: "open",
					author: "ada",
					sourceBranch: "fix",
					targetBranch: "main",
					headCommit: "abc",
					updatedAt: "2026-01-01",
					isDraft: true,
					reviewers: [{ name: "Bob", avatarUrl: null, state: "approved" }],
					checksStatus: "failure",
					fetchedAt: Date.now(),
				},
			})
			.run();
		const ctx = { db, organizationId: store.scope } as unknown as Parameters<
			typeof forkWithBitbucketPullRequests
		>[0];
		const [snapshot] = forkWithBitbucketPullRequests(ctx, [
			{
				workspaceId: "ws-1",
				pullRequest: null,
				error: null,
				lastFetchedAt: null,
			},
		]);
		expect(snapshot?.pullRequest).toMatchObject({
			number: 7,
			state: "draft",
			reviewDecision: "approved",
			checksStatus: "failure",
		});
	} finally {
		sqlite.close();
	}
});
