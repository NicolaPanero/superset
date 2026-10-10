import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { buildChatAgentEnv } from "../../src/chat-v3/agentEnv";
import { forkLaunchChoices } from "../../src/chat-v3/forkLaunchChoices";
import {
	getTerminalBaseEnv,
	initTerminalBaseEnv,
	resetTerminalBaseEnvForTests,
} from "../../src/terminal/env";
import { agentConfigsRouter } from "../../src/trpc/router/settings/agent-configs";
import {
	getDefaultAccountSelections,
	setDefaultAccountSelection,
} from "../../src/trpc/router/usage/default-account";
import { recordCreatedBranch } from "../../src/trpc/router/workspace-cleanup/fork-branch-ownership";
import type { HostServiceContext } from "../../src/types";
import { createBasicScenario } from "../helpers/scenarios";

test("new creations record provenance; existing branches and forced local deletes preserve commits", async () => {
	const scenario = await createBasicScenario();
	try {
		const { host, repo, projectId, workspaceId } = scenario;
		const head = await repo.git.revparse(["main"]);
		await recordCreatedBranch(repo.git, "main", workspaceId);
		const localPreview = await host.trpc.workspaceCleanup.inspect.query({
			workspaceId,
		});
		expect(localPreview.branchDeletion?.reason).toBe("project_checkout");
		await host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId,
			deleteBranch: true,
			force: true,
		});
		expect(await repo.git.revparse(["main"])).toBe(head);

		const created = await host.trpc.workspaces.create.mutate({
			id: randomUUID(),
			projectId,
			branch: "owned",
			skipBranchPrefix: true,
		});
		const ownedId = created.workspace.id;
		const ownedBranch = created.workspace.branch;
		expect(
			(
				await repo.git.raw([
					"config",
					"--local",
					"--get",
					`branch.${ownedBranch}.supersetForkCreatedBy`,
				])
			).trim(),
		).toBe(ownedId);
		expect(
			(await host.trpc.workspaceCleanup.inspect.query({ workspaceId: ownedId }))
				.branchDeletion?.eligible,
		).toBe(true);
		expect(
			(
				await host.trpc.workspaceCleanup.destroy.mutate({
					workspaceId: ownedId,
					deleteBranch: true,
					force: true,
				})
			).branchDeleted,
		).toBe(true);

		await repo.git.branch(["imported"]);
		const imported = await host.trpc.workspaces.create.mutate({
			id: randomUUID(),
			projectId,
			branch: "imported",
			skipBranchPrefix: true,
		});
		expect(
			(
				await host.trpc.workspaceCleanup.inspect.query({
					workspaceId: imported.workspace.id,
				})
			).branchDeletion?.eligible,
		).toBe(false);
		expect(
			(
				await host.trpc.workspaceCleanup.destroy.mutate({
					workspaceId: imported.workspace.id,
					deleteBranch: true,
					force: true,
				})
			).branchDeleted,
		).toBe(false);
		expect(await repo.git.revparse(["imported"])).toBe(head);
	} finally {
		await scenario.dispose();
	}
});

test("a missing chosen account fails before workspace creation", async () => {
	const scenario = await createBasicScenario();
	try {
		const before = (await scenario.repo.git.branchLocal()).all;
		await expect(
			scenario.host.trpc.workspaces.create.mutate({
				id: randomUUID(),
				projectId: scenario.projectId,
				branch: "must-not-exist",
				agents: [
					{
						agent: "claude",
						prompt: "do not send",
						accountSelection: "/missing-superset-account",
					},
				],
			}),
		).rejects.toThrow();
		expect((await scenario.repo.git.branchLocal()).all).toEqual(before);
	} finally {
		await scenario.dispose();
	}
});

test("an imported chat can explicitly use the system login while another profile stays the host default", async () => {
	const scenario = await createBasicScenario();
	let previousEnv: Record<string, string> | undefined;
	try {
		previousEnv = getTerminalBaseEnv();
	} catch {}
	try {
		initTerminalBaseEnv({ PATH: process.env.PATH ?? "/usr/bin:/bin" });
		await agentConfigsRouter
			.createCaller({
				db: scenario.host.db,
				isAuthenticated: true,
			} as HostServiceContext)
			.list();
		setDefaultAccountSelection(
			scenario.host.db,
			"claude",
			scenario.repo.repoPath,
		);
		const choices = forkLaunchChoices(scenario.host.db, "claude-acp", {
			accountSelection: null,
		});
		const selected = await buildChatAgentEnv({
			db: scenario.host.db,
			cwd: scenario.repo.repoPath,
			workspaceId: scenario.workspaceId,
			...choices,
		});
		expect(selected.CLAUDE_CONFIG_DIR).toBeUndefined();
		expect(selected.SUPERSET_PINNED_ACCOUNT_ENV).toBe("CLAUDE_CONFIG_DIR");
		expect(selected.SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR).toBe("");
		expect(getDefaultAccountSelections(scenario.host.db).claudeConfigDir).toBe(
			scenario.repo.repoPath,
		);
		const ordinary = await buildChatAgentEnv({
			db: scenario.host.db,
			cwd: scenario.repo.repoPath,
			workspaceId: scenario.workspaceId,
			agentConfigId: choices.agentConfigId,
		});
		expect(ordinary.CLAUDE_CONFIG_DIR).toBe(scenario.repo.repoPath);
	} finally {
		if (previousEnv) initTerminalBaseEnv(previousEnv);
		else resetTerminalBaseEnvForTests();
		await scenario.dispose();
	}
});
