import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { recordCreatedBranch } from "../../src/trpc/router/workspace-cleanup/fork-branch-ownership";
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
