import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { projects } from "../../src/db/schema";
import { createBasicScenario } from "../helpers/scenarios";

test("a live Bitbucket remote replaces stale GitHub metadata without GitHub search errors", async () => {
	const scenario = await createBasicScenario();
	try {
		const { host, repo, projectId } = scenario;
		await repo.git.addRemote("origin", "https://bitbucket.org/team/app.git");
		host.db
			.update(projects)
			.set({ repoUrl: "https://github.com/old/repository.git" })
			.where(eq(projects.id, projectId))
			.run();
		await expect(
			host.trpc.workspaceCreation.searchPullRequests.query({ projectId }),
		).rejects.toThrow("has no GitHub remote");
		const discovered = await host.trpc.forkScm.projects.query();
		expect(
			discovered.find((p) => p.projectId === projectId)?.repository.provider,
		).toBe("bitbucket");
		const result = await host.trpc.forkScm.searchPullRequests.query({
			projectId,
		});
		expect(result.pullRequests).toEqual([]);
		expect(result.warnings).toEqual([
			{ repository: "team/app", kind: "connection" },
		]);
	} finally {
		await scenario.dispose();
	}
});
