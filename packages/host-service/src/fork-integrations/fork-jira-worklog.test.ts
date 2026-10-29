import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { HostDb } from "../db";
import { forkJiraWorklogOps } from "../db/fork-schema";
import { ensureForkTables } from "../db/fork-tables";
import type { ForkApi } from "./fork-api";
import { ForkJiraProvider } from "./fork-jira";
import { forkAddJiraWorklog } from "./fork-jira-worklog";

function fixture(post: (body: unknown) => Promise<{ id: string }>) {
	const sqlite = new Database(":memory:");
	sqlite.exec(
		"CREATE TABLE projects (id text PRIMARY KEY); CREATE TABLE workspaces (id text PRIMARY KEY);",
	);
	ensureForkTables(sqlite);
	const stored: { id: string; started: string; timeSpentSeconds: number }[] =
		[];
	let posts = 0;
	const api = {
		connection: () => ({
			provider: "jira",
			site: "https://example.test",
			identity: { id: "me" },
		}),
		request: async (
			_id: string,
			path: string,
			method?: string,
			body?: unknown,
		) => {
			if (method === "POST") {
				posts++;
				return post(body);
			}
			if (path.includes("/worklog"))
				return {
					startAt: 0,
					total: stored.length,
					worklogs: stored.map((entry) => ({
						...entry,
						author: { accountId: "me", displayName: "Me" },
						created: entry.started,
					})),
				};
			throw new Error(`unexpected ${path}`);
		},
	} as unknown as ForkApi;
	return {
		sqlite,
		stored,
		posts: () => posts,
		ctx: { db: drizzle(sqlite) as unknown as HostDb, organizationId: "org" },
		jira: new ForkJiraProvider(api),
	};
}

const input = {
	connectionId: "jira",
	key: "APP-1",
	clientOpId: "6f6f1a8e-6f57-4b16-9a4e-2f1f6c2c1d1a",
	date: "2026-10-30",
	time: "09:00",
	timeZone: "Europe/Rome",
	timeSpentSeconds: 900,
};

test("a repeated request with the same operation id posts once", async () => {
	const f = fixture(async () => ({ id: "w1" }));
	try {
		const first = await forkAddJiraWorklog(f.ctx, f.jira, input);
		const second = await forkAddJiraWorklog(f.ctx, f.jira, input);
		expect(first).toEqual({
			worklogId: "w1",
			reused: false,
			ambiguousTime: false,
		});
		expect(second.reused).toBe(true);
		expect(f.posts()).toBe(1);
	} finally {
		f.sqlite.close();
	}
});

test("after an unanswered post, a retry finds the worklog in Jira and does not post again", async () => {
	let fail = true;
	const f = fixture(async (body) => {
		const entry = body as { started: string; timeSpentSeconds: number };
		f.stored.push({ id: "w9", ...entry });
		if (fail)
			throw new TRPCError({ code: "BAD_GATEWAY", message: "unreachable" });
		return { id: "w9" };
	});
	try {
		await expect(forkAddJiraWorklog(f.ctx, f.jira, input)).rejects.toThrow(
			"did not confirm",
		);
		expect(f.ctx.db.select().from(forkJiraWorklogOps).get()?.state).toBe(
			"unknown",
		);
		fail = false;
		const retry = await forkAddJiraWorklog(f.ctx, f.jira, input);
		expect(retry).toEqual({
			worklogId: "w9",
			reused: true,
			ambiguousTime: false,
		});
		expect(f.posts()).toBe(1);
		expect(f.stored[0]?.started).toBe("2026-10-30T09:00:00.000+0100");
	} finally {
		f.sqlite.close();
	}
});

test("a rejected post leaves nothing to reconcile", async () => {
	const f = fixture(async () => {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "no",
			cause: { status: 400 },
		});
	});
	try {
		await expect(forkAddJiraWorklog(f.ctx, f.jira, input)).rejects.toThrow(
			"no",
		);
		expect(f.ctx.db.select().from(forkJiraWorklogOps).all()).toEqual([]);
	} finally {
		f.sqlite.close();
	}
});

test("a time skipped by daylight saving is refused before calling Jira", async () => {
	const f = fixture(async () => ({ id: "w1" }));
	try {
		await expect(
			forkAddJiraWorklog(f.ctx, f.jira, {
				...input,
				date: "2026-03-29",
				time: "02:30",
			}),
		).rejects.toThrow("does not exist");
		expect(f.posts()).toBe(0);
	} finally {
		f.sqlite.close();
	}
});

test("a second request for an operation that is still being sent is refused", async () => {
	let release: () => void = () => {};
	const f = fixture(
		() =>
			new Promise<{ id: string }>((resolve) => {
				release = () => resolve({ id: "w1" });
			}),
	);
	try {
		const first = forkAddJiraWorklog(f.ctx, f.jira, input);
		await expect(forkAddJiraWorklog(f.ctx, f.jira, input)).rejects.toThrow(
			"already being sent",
		);
		release();
		expect((await first).worklogId).toBe("w1");
		expect(f.posts()).toBe(1);
	} finally {
		f.sqlite.close();
	}
});
