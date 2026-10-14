import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
	readRecovery,
	recoveryControllers,
	recoveryKey,
	writeRecovery,
} from "../../src/chat-v3/forkQuotaRecoveryStore";
import { workspaces } from "../../src/db/schema";
import { createBasicScenario } from "../helpers/scenarios";

test("per-chat continuation persists independently, clears automatic selection and expires on workspace deletion", async () => {
	const scenario = await createBasicScenario();
	try {
		const { host, workspaceId } = scenario,
			input = { workspaceId, terminalId: randomUUID() };
		expect(await host.trpc.agents.quotaRecovery.query(input)).toMatchObject({
			supported: true,
			switchAccounts: false,
			resumeAtReset: false,
		});
		await host.trpc.agents.setQuotaRecovery.mutate({
			...input,
			switchAccounts: true,
		});
		await host.trpc.agents.setQuotaRecovery.mutate({
			...input,
			resumeAtReset: true,
		});
		expect(await host.trpc.agents.quotaRecovery.query(input)).toMatchObject({
			switchAccounts: true,
			resumeAtReset: true,
		});
		expect(
			await host.trpc.agents.quotaRecovery.query({
				...input,
				terminalId: randomUUID(),
			}),
		).toMatchObject({ switchAccounts: false, resumeAtReset: false });
		writeRecovery(host.db, workspaceId, input.terminalId, {
			hasSelection: true,
			accountSelection: "/profile",
		});
		await host.trpc.agents.setQuotaRecovery.mutate({
			...input,
			clearSelection: true,
		});
		expect(readRecovery(host.db, workspaceId, input.terminalId)).toMatchObject({
			hasSelection: false,
			switchAccounts: true,
			resumeAtReset: true,
		});
		host.db.delete(workspaces).where(eq(workspaces.id, workspaceId)).run();
		expect(
			readRecovery(host.db, workspaceId, input.terminalId),
		).toBeUndefined();
	} finally {
		await scenario.dispose();
	}
});

test("changing continuation options notifies the current live chat immediately without a handoff", async () => {
	const scenario = await createBasicScenario();
	const input = { workspaceId: scenario.workspaceId, terminalId: randomUUID() };
	const key = recoveryKey(input.workspaceId, input.terminalId);
	const snapshots: unknown[] = [];
	recoveryControllers.set(key, {
		status: { phase: "idle" },
		changed: () =>
			snapshots.push(
				readRecovery(scenario.host.db, input.workspaceId, input.terminalId),
			),
	});
	try {
		await scenario.host.trpc.agents.setQuotaRecovery.mutate({
			...input,
			resumeAtReset: true,
		});
		expect(snapshots).toHaveLength(1);
		expect(snapshots[0]).toMatchObject({
			switchAccounts: false,
			resumeAtReset: true,
		});
		expect(
			await scenario.host.trpc.agents.quotaRecovery.query(input),
		).toMatchObject({ switchAccounts: false, resumeAtReset: true });
	} finally {
		recoveryControllers.delete(key);
		await scenario.dispose();
	}
});

test("quota recovery advertises provider capabilities without changing legacy requests", async () => {
	const scenario = await createBasicScenario();
	try {
		const input = {
			workspaceId: scenario.workspaceId,
			terminalId: randomUUID(),
		};
		expect(
			(await scenario.host.trpc.agents.quotaRecovery.query(input)).supported,
		).toBe(true);
		for (const agent of ["claude", "codex"]) {
			expect(
				(
					await scenario.host.trpc.agents.quotaRecovery.query({
						...input,
						agent,
					})
				).capabilities,
			).toEqual({ switchAccounts: true, resumeAtReset: true });
			await scenario.host.trpc.agents.setQuotaRecovery.mutate({
				...input,
				agent,
				resumeAtReset: true,
			});
		}
		for (const agent of [
			"cursor-agent",
			"grok",
			"opencode",
			"gemini",
			"agy",
			"custom",
		]) {
			expect(
				(
					await scenario.host.trpc.agents.quotaRecovery.query({
						...input,
						agent,
					})
				).capabilities,
			).toEqual({ switchAccounts: false, resumeAtReset: false });
			await expect(
				scenario.host.trpc.agents.setQuotaRecovery.mutate({
					...input,
					agent,
					switchAccounts: true,
				}),
			).rejects.toMatchObject({ data: { code: "PRECONDITION_FAILED" } });
		}
	} finally {
		await scenario.dispose();
	}
});
