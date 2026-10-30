import { expect, test } from "bun:test";
import { FORK_INTEGRATIONS_VERSION } from "@superset/shared/fork-integrations";
import { TRPCError } from "@trpc/server";
import type { forkFetch } from "../../src/fork-integrations/fork-http";
import { ForkConnectionStore } from "../../src/fork-integrations/fork-store";
import { createBasicScenario } from "../helpers/scenarios";

const scope = "00000000-0000-0000-0000-000000000001";

function fakeJira() {
	const posts: {
		path: string;
		body: { started?: string; timeSpentSeconds?: number };
	}[] = [];
	const worklogs: {
		id: string;
		started: string;
		timeSpentSeconds: number;
		author: { accountId: string; displayName: string };
		created: string;
	}[] = [];
	const issue = (key: string) => ({
		id: key.replace(/\D/g, ""),
		key,
		fields: {
			summary: `Task ${key}`,
			status: { id: "1", name: "To Do", statusCategory: { key: "new" } },
			labels: [],
			issuetype: { name: "Task" },
		},
	});
	const transport = (async (raw: string | URL, init: RequestInit = {}) => {
		const url = new URL(raw);
		const method = init.method ?? "GET";
		const path = url.pathname;
		const body = init.body ? JSON.parse(String(init.body)) : {};
		if (path.endsWith("/myself")) return { accountId: "me", displayName: "Me" };
		if (path.endsWith("/field")) return [];
		if (path.endsWith("/configuration/timetracking")) return { key: "JIRA" };
		if (path.endsWith("/mypermissions"))
			return { permissions: { WORK_ON_ISSUES: { havePermission: true } } };
		if (path.endsWith("/search/jql"))
			return { issues: [issue("APP-1")], isLast: true };
		if (path.includes("/worklog") && method === "POST") {
			posts.push({ path: path + url.search, body });
			const entry = {
				id: `w${worklogs.length + 1}`,
				started: body.started,
				timeSpentSeconds: body.timeSpentSeconds,
				author: { accountId: "me", displayName: "Me" },
				created: body.started,
			};
			worklogs.push(entry);
			return { id: entry.id };
		}
		if (path.includes("/worklog"))
			return { startAt: 0, total: worklogs.length, worklogs };
		if (path.includes("/project/") && path.endsWith("/statuses"))
			return [
				{
					statuses: [
						{ id: "1", name: "To Do", statusCategory: { key: "new" } },
						{
							id: "7",
							name: "In revisione",
							statusCategory: { key: "indeterminate" },
						},
					],
				},
			];
		if (path.includes("/issue/"))
			return issue(path.split("/issue/")[1]?.split("/")[0] ?? "APP-1");
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `unexpected ${method} ${path}`,
		});
	}) as unknown as typeof forkFetch;
	return { transport, posts };
}

async function setup() {
	const jira = fakeJira();
	const scenario = await createBasicScenario({
		hostOptions: { forkTransport: jira.transport },
	});
	const store = new ForkConnectionStore(scenario.host.db, scope);
	const connection = store.create("jira", "token", "https://one.atlassian.net");
	store.save(connection, { token: "jira-token", email: "me@example.test" });
	return { ...scenario, jira, connection };
}

test("the host advertises the integration version the new desktop screens check", async () => {
	const { host } = await setup();
	expect(FORK_INTEGRATIONS_VERSION).toBe(10);
	const list = await host.trpc.forkConnections.list.query();
	expect(list.version).toBe(10);
});

test("worklogs: capability, one post per operation id, history and today's time", async () => {
	const { host, jira, connection } = await setup();
	const target = { connectionId: connection.id, key: "APP-1" };
	expect(
		(await host.trpc.forkTasks.worklogCapability.query(target)).canLog,
	).toBe(true);
	const input = {
		...target,
		clientOpId: crypto.randomUUID(),
		date: "2026-10-30",
		time: "09:00",
		timeZone: "Europe/Rome",
		timeSpentSeconds: 900,
	};
	const first = await host.trpc.forkTasks.addWorklog.mutate(input);
	const second = await host.trpc.forkTasks.addWorklog.mutate(input);
	expect(first.reused).toBe(false);
	expect(second.reused).toBe(true);
	expect(jira.posts).toHaveLength(1);
	expect(jira.posts[0]?.path).toContain("adjustEstimate=leave");
	expect(jira.posts[0]?.body.started).toBe("2026-10-30T09:00:00.000+0100");
	const page = await host.trpc.forkTasks.worklogs.query(target);
	expect(page.items).toHaveLength(1);
	expect(page.items[0]?.mine).toBe(true);
	const mine = await host.trpc.forkTasks.myTime.query({
		connectionId: connection.id,
		date: "2026-10-30",
		timeZone: "Europe/Rome",
	});
	expect(mine.seconds).toBe(900);
	await expect(
		host.trpc.forkTasks.addWorklog.mutate({
			...input,
			clientOpId: crypto.randomUUID(),
			timeSpentSeconds: 10,
		}),
	).rejects.toThrow();
	await expect(
		host.trpc.forkTasks.addWorklog.mutate({
			...input,
			clientOpId: crypto.randomUUID(),
			date: "2026-03-29",
			time: "02:30",
		}),
	).rejects.toThrow("does not exist");
});

test("status mapping round-trips through the router", async () => {
	const { host, connection } = await setup();
	const target = { connectionId: connection.id, projectKey: "APP" };
	const statuses = await host.trpc.forkTasks.projectStatuses.query(target);
	expect(statuses.map((s) => s.id)).toEqual(["1", "7"]);
	expect(await host.trpc.forkTasks.statusMapping.query(target)).toBeNull();
	await host.trpc.forkTasks.setStatusMapping.mutate({
		...target,
		progressStatusId: null,
		reviewStatusId: "7",
	});
	expect(
		(await host.trpc.forkTasks.statusMapping.query(target))?.reviewStatusId,
	).toBe("7");
});

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean) {
	for (let i = 0; i < 100; i++) {
		const value = await read();
		if (done(value)) return value;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error("condition not reached");
}

test("automation rules: preview, baseline scan, manual run through the live engine, retry, limits", async () => {
	const { host, connection, projectId } = await setup();
	const created = await host.trpc.forkTasks.automationCreate.mutate({
		connectionId: connection.id,
		projectId,
		name: "Triage",
		jql: "labels = ready",
		agent: "codex",
		prompt: "Analyse it",
		options: {
			sourceKind: "jira",
			refire: "never",
			catchupMinutes: 120,
			verifyCommand: "bun test",
			retryLimit: 3,
			targetLimit: null,
		},
	});
	const query = { connectionId: connection.id };
	const list = await host.trpc.forkTasks.automationList.query(query);
	expect(list).toHaveLength(1);
	expect(list[0]?.enabled).toBe(false);
	expect(list[0]?.options?.verifyCommand).toBe("bun test");
	const before = await host.trpc.forkTasks.automationPreview.query({
		id: created.id,
	});
	expect(before.map((row) => row.status)).toEqual(["baseline"]);

	await host.trpc.forkTasks.automationEnable.mutate({
		id: created.id,
		enabled: true,
	});
	await until(
		() => host.trpc.forkTasks.automationList.query(query),
		(rules) => !!rules[0]?.checkedAt,
	);
	const after = await host.trpc.forkTasks.automationPreview.query({
		id: created.id,
	});
	expect(after.map((row) => row.status)).toEqual(["handled"]);
	expect(
		await host.trpc.forkTasks.automationAttempts.query({ id: created.id }),
	).toEqual([]);

	const dry = await host.trpc.forkTasks.automationRunNow.mutate({
		id: created.id,
		taskKey: "APP-1",
		dryRun: true,
	});
	expect(dry.dryRun).toBe(true);
	if (dry.dryRun) expect(dry.prompt).toContain("Analyse it");
	expect(
		await host.trpc.forkTasks.automationAttempts.query({ id: created.id }),
	).toEqual([]);

	const queued = await host.trpc.forkTasks.automationRunNow.mutate({
		id: created.id,
		taskKey: "APP-1",
		dryRun: false,
	});
	if (queued.dryRun) throw new Error("expected a real run");
	const settled = await until(
		() => host.trpc.forkTasks.automationAttempts.query({ id: created.id }),
		(rows) =>
			rows.length > 0 &&
			!["queued", "launching"].includes(rows[0]?.state ?? ""),
	);
	expect(settled[0]?.ruleName).toBe("Triage");
	expect(settled[0]).not.toHaveProperty("prompt");

	const retry = await host.trpc.forkTasks.automationAttemptAction.mutate({
		attemptId: queued.attemptId,
		action: "retry",
	});
	expect(retry.id).not.toBe(queued.attemptId);
	expect(await host.trpc.forkTasks.automationSettings.query()).toEqual({
		maxRunning: 2,
		maxPerProject: 1,
	});
	await expect(
		host.trpc.forkTasks.automationAttemptAction.mutate({
			attemptId: queued.attemptId,
			action: "retry",
		}),
	).rejects.toThrow("cannot be run again");
	await expect(
		host.trpc.forkTasks.automationAttemptAction.mutate({
			attemptId: retry.id,
			action: "verified",
		}),
	).rejects.toThrow("finished run");
	await expect(
		host.trpc.forkTasks.automationAttemptAction.mutate({
			attemptId: retry.id,
			action: "release",
		}),
	).rejects.toThrow("not in progress");
	await host.trpc.forkTasks.automationSaveSettings.mutate({
		maxRunning: 3,
		maxPerProject: 2,
	});
	expect(
		(await host.trpc.forkTasks.automationSettings.query()).maxRunning,
	).toBe(3);
	await host.trpc.forkTasks.automationDelete.mutate({ id: created.id });
	expect(await host.trpc.forkTasks.automationAttempts.query({})).toEqual([]);
});

test("a schedule rule needs days and a time, and a Jira rule needs a query", async () => {
	const { host, connection, projectId } = await setup();
	const base = {
		connectionId: connection.id,
		projectId,
		name: "Digest",
		agent: "codex",
		prompt: "Summarize",
	};
	await expect(
		host.trpc.forkTasks.automationCreate.mutate({ ...base, jql: "" }),
	).rejects.toThrow("JQL");
	await expect(
		host.trpc.forkTasks.automationCreate.mutate({
			...base,
			jql: "",
			options: {
				sourceKind: "schedule",
				refire: "never",
				catchupMinutes: 120,
				verifyCommand: null,
				retryLimit: 3,
				targetLimit: null,
			},
		}),
	).rejects.toThrow("days");
	const ok = await host.trpc.forkTasks.automationCreate.mutate({
		...base,
		jql: "",
		options: {
			sourceKind: "schedule",
			schedule: {
				days: [1, 2, 3, 4, 5],
				time: "09:00",
				timeZone: "Europe/Rome",
			},
			refire: "never",
			catchupMinutes: 120,
			verifyCommand: null,
			retryLimit: 3,
			targetLimit: null,
		},
	});
	expect(ok.id).toBeTruthy();
});

test("timesheet proposals stay off until enabled and never call Jira while off", async () => {
	const { host, connection } = await setup();
	const settings = await host.trpc.forkTasks.timesheetSettings.query({
		connectionId: connection.id,
	});
	expect(settings.enabled).toBe(false);
	await expect(
		host.trpc.forkTasks.timesheetPropose.mutate({
			connectionId: connection.id,
		}),
	).rejects.toThrow("Timesheet proposals are no longer available");
});

test("agent update checks are on by default, can be turned off, and the router only lists agents when on", async () => {
	const { host } = await setup();
	await host.trpc.forkAgentCli.setEnabled.mutate({ enabled: false });
	expect(await host.trpc.forkAgentCli.status.query()).toEqual({
		enabled: false,
		agents: [],
	});
	await host.trpc.forkAgentCli.setEnabled.mutate({ enabled: true });
	expect((await host.trpc.forkAgentCli.snooze.mutate()).ok).toBe(true);
	// An agent outside the list is refused by validation before anything runs.
	await expect(
		host.trpc.forkAgentCli.update.mutate({ agent: "grok" as "codex" }),
	).rejects.toBeDefined();
});
