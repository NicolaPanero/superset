import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { workspaces } from "../../src/db/schema";
import { createTestHost } from "../helpers/createTestHost";
import { seedWorkspace } from "../helpers/seed";

test("the authenticated background-chat API preserves resume metadata and supports reopening once", async () => {
	const host = await createTestHost();
	try {
		const { id: workspaceId } = seedWorkspace(host, {
			worktreePath: "/fixture",
			branch: "main",
			type: "session",
		});
		const paneData = {
			terminalId: "pane",
			agentSurface: "acp",
			agent: { id: "claude", sessionId: "native-session" },
			acpSessionId: "runtime-session",
			acpAccountSelection: "/profiles/work",
			acpAgentConfigId: "config",
			model: { id: "sonnet" },
		};
		await host.trpc.agents.parkChat.mutate({
			workspaceId,
			terminalId: "pane",
			title: "Task",
			paneData,
		});
		const parked = await host.trpc.agents.parkedChats.query({ workspaceId });
		expect(parked).toHaveLength(1);
		expect(parked[0]?.paneData).toEqual(paneData);
		await host.trpc.agents.unparkChat.mutate({ terminalId: "pane" });
		expect(await host.trpc.agents.parkedChats.query({ workspaceId })).toEqual(
			[],
		);
		await host.trpc.agents.unparkChat.mutate({ terminalId: "pane" });
	} finally {
		await host.dispose();
	}
});

test("background listings and workspace deletion are scoped to their workspace", async () => {
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
		const panes: [string, string][] = [
			[a, "a-pane"],
			[b, "b-pane"],
		];
		for (const [workspaceId, terminalId] of panes)
			await host.trpc.agents.parkChat.mutate({
				workspaceId,
				terminalId,
				title: terminalId,
				paneData: { terminalId },
			});
		expect(
			(await host.trpc.agents.parkedChats.query({ workspaceId: a })).map(
				(row) => row.terminalId,
			),
		).toEqual(["a-pane"]);
		host.db.delete(workspaces).where(eq(workspaces.id, a)).run();
		expect(
			await host.trpc.agents.parkedChats.query({ workspaceId: a }),
		).toEqual([]);
		expect(
			(await host.trpc.agents.parkedChats.query({ workspaceId: b })).map(
				(row) => row.terminalId,
			),
		).toEqual(["b-pane"]);
	} finally {
		await host.dispose();
	}
});

test("untrusted callers cannot read parked chats or modify continuation preferences", async () => {
	const host = await createTestHost();
	try {
		const { id: workspaceId } = seedWorkspace(host, {
			worktreePath: "/fixture",
			branch: "main",
			type: "session",
		});
		await expect(
			host.unauthenticatedTrpc.agents.parkedChats.query({ workspaceId }),
		).rejects.toMatchObject({ data: { code: "UNAUTHORIZED" } });
		await expect(
			host.unauthenticatedTrpc.agents.setQuotaRecovery.mutate({
				workspaceId,
				terminalId: "pane",
				resumeAtReset: true,
			}),
		).rejects.toMatchObject({ data: { code: "UNAUTHORIZED" } });
		expect(
			await host.trpc.agents.quotaRecovery.query({
				workspaceId,
				terminalId: "pane",
			}),
		).toMatchObject({ switchAccounts: false, resumeAtReset: false });
	} finally {
		await host.dispose();
	}
});
