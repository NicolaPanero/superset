import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { forkFetch } from "../../src/fork-integrations/fork-http";
import { ForkConnectionStore } from "../../src/fork-integrations/fork-store";
import { forkProviderFixture } from "../helpers/fork-provider-fixture";
import { createBasicScenario } from "../helpers/scenarios";

test("New Workspace opens a selected Bitbucket PR and exposes its review through the workspace API", async () => {
	const fixture = forkProviderFixture();
	let head = "";
	const transport = (async (url, init) => {
		const result = (await fixture.transport(url, init)) as {
			source?: { commit: { hash: string } };
		};
		if (result.source)
			return {
				...result,
				source: { ...result.source, commit: { hash: head } },
			};
		return result;
	}) as typeof forkFetch;
	const scenario = await createBasicScenario({
		hostOptions: { forkTransport: transport },
	});
	try {
		const { host, repo, projectId } = scenario;
		head = (await repo.git.revparse(["HEAD"])).trim();
		await repo.git.branch(["feature"]);
		await repo.git.addRemote("origin", "git@bitbucket.org:team/app.git");
		const store = new ForkConnectionStore(
			host.db,
			"00000000-0000-0000-0000-000000000001",
		);
		const account = store.create("bitbucket", "token", null);
		store.save(account, {
			email: "qa@example.test",
			token: "bb-workspace-test",
		});
		expect(
			(await host.trpc.project.list.query()).find((p) => p.id === projectId)
				?.repoUrl,
		).toBe("https://bitbucket.org/team/app");
		const search = await host.trpc.forkScm.searchPullRequests.query({
			projectId,
		});
		expect(search.pullRequests[0]).toMatchObject({
			provider: "bitbucket",
			prNumber: 7,
		});
		const created = await host.trpc.workspaces.create.mutate({
			id: randomUUID(),
			projectId,
			pr: 7,
			runSetup: false,
		});
		expect(created.workspace.branch).toBe("feature");
		const linked = await host.trpc.git.getPullRequest.query({
			workspaceId: created.workspace.id,
		});
		expect(linked?.url).toBe("https://bitbucket.org/team/app/pull-requests/7");
		expect(
			(
				await host.trpc.git.getPullRequestThreads.query({
					workspaceId: created.workspace.id,
				})
			).reviewThreads,
		).toEqual([]);
		expect(
			fixture.calls.every((call) => call.host === "api.bitbucket.org"),
		).toBe(true);
	} finally {
		await scenario.dispose();
	}
});
