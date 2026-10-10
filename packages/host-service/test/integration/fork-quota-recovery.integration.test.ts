import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
	readRecovery,
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
