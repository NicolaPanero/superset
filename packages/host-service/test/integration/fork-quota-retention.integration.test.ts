import { afterEach, expect, setSystemTime, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
	readRecovery,
	writeRecovery,
} from "../../src/chat-v3/forkQuotaRecoveryStore";
import { createTestHost } from "../helpers/createTestHost";
import { seedWorkspace } from "../helpers/seed";

afterEach(() => setSystemTime());

test("continuation settings cannot leak between workspaces with the same terminal identifier", async () => {
	const host = await createTestHost();
	try {
		const a = seedWorkspace(host, {
				worktreePath: "/a",
				branch: "main",
				type: "session",
			}).id,
			b = seedWorkspace(host, {
				worktreePath: "/b",
				branch: "main",
				type: "session",
			}).id;
		await host.trpc.agents.setQuotaRecovery.mutate({
			workspaceId: a,
			terminalId: "same-pane",
			switchAccounts: true,
		});
		expect(
			await host.trpc.agents.quotaRecovery.query({
				workspaceId: b,
				terminalId: "same-pane",
			}),
		).toMatchObject({ switchAccounts: false, resumeAtReset: false });
		await host.trpc.agents.setQuotaRecovery.mutate({
			workspaceId: b,
			terminalId: "same-pane",
			resumeAtReset: true,
		});
		expect(
			await host.trpc.agents.quotaRecovery.query({
				workspaceId: a,
				terminalId: "same-pane",
			}),
		).toMatchObject({ switchAccounts: true, resumeAtReset: false });
	} finally {
		await host.dispose();
	}
});

test("expired settings and automatic account choices cannot be revived by changing another option", async () => {
	const host = await createTestHost();
	try {
		const { id: workspaceId } = seedWorkspace(host, {
			worktreePath: "/fixture",
			branch: "main",
			type: "session",
		});
		const start = Date.now();
		setSystemTime(start);
		writeRecovery(host.db, workspaceId, "pane", {
			switchAccounts: true,
			hasSelection: true,
			accountSelection: "/old",
			nativeSessionId: "old-native",
		});
		setSystemTime(start + 30 * 24 * 60 * 60000 + 1);
		expect(readRecovery(host.db, workspaceId, "pane")).toBeUndefined();
		await host.trpc.agents.setQuotaRecovery.mutate({
			workspaceId,
			terminalId: "pane",
			resumeAtReset: true,
		});
		expect(readRecovery(host.db, workspaceId, "pane")).toMatchObject({
			switchAccounts: false,
			resumeAtReset: true,
			hasSelection: false,
			accountSelection: null,
			nativeSessionId: null,
		});
	} finally {
		await host.dispose();
	}
});

test("retention caps old closed-chat settings at 1024 entries without evicting the newest", async () => {
	const host = await createTestHost();
	try {
		const { id: workspaceId } = seedWorkspace(host, {
			worktreePath: "/fixture",
			branch: "main",
			type: "session",
		});
		const start = Date.now();
		for (let index = 0; index < 1025; index++) {
			setSystemTime(start + index);
			writeRecovery(host.db, workspaceId, `pane-${index}`, {
				resumeAtReset: true,
			});
		}
		expect(
			host.db.$client
				.prepare("SELECT COUNT(*) AS count FROM chat_quota_recovery")
				.get(),
		).toEqual({ count: 1024 });
		expect(readRecovery(host.db, workspaceId, "pane-0")).toBeUndefined();
		expect(readRecovery(host.db, workspaceId, "pane-1024")?.resumeAtReset).toBe(
			true,
		);
	} finally {
		await host.dispose();
	}
});

test("deleted or unknown workspace IDs cannot create continuation state", async () => {
	const host = await createTestHost();
	try {
		await expect(
			host.trpc.agents.setQuotaRecovery.mutate({
				workspaceId: randomUUID(),
				terminalId: "pane",
				resumeAtReset: true,
			}),
		).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
		expect(
			host.db.$client
				.prepare("SELECT COUNT(*) AS count FROM chat_quota_recovery")
				.get(),
		).toEqual({ count: 0 });
	} finally {
		await host.dispose();
	}
});
