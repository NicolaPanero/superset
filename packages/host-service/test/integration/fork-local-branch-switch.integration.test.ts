import { expect, test } from "bun:test";
import type { forkFetch } from "../../src/fork-integrations/fork-http";
import { ForkConnectionStore } from "../../src/fork-integrations/fork-store";
import { forkProviderFixture } from "../helpers/fork-provider-fixture";
import { createBasicScenario } from "../helpers/scenarios";

test("a local checkout switched outside the app stops showing the old branch and PR", async () => {
	const fixture = forkProviderFixture();
	let newBranch = false;
	const transport = (async (url, init) => {
		if (new URL(String(url)).pathname === "/2.0/repositories/team/app")
			return { mainbranch: { name: "main" } };
		const data = await fixture.transport(url, init);
		if (new URL(String(url)).pathname.endsWith("/pullrequests") && newBranch)
			return { values: [], size: 0 };
		return data;
	}) as typeof forkFetch;
	const scenario = await createBasicScenario({
		hostOptions: { forkTransport: transport },
	});
	try {
		const { host, repo, workspaceId } = scenario;
		await repo.git.checkoutLocalBranch("feature");
		await repo.git.addRemote("origin", "git@bitbucket.org:team/app.git");
		const store = new ForkConnectionStore(
			host.db,
			"00000000-0000-0000-0000-000000000001",
		);
		const account = store.create("bitbucket", "token", null);
		store.save(account, { email: "qa@example.test", token: "test" });
		const old = await host.trpc.forkScm.workspace.query({ workspaceId });
		expect(old.branch).toBe("feature");
		expect({
			pr: old.pullRequest?.number,
			error: old.error,
			repo: old.repository,
		}).toEqual({ pr: 7, error: null, repo: old.repository });
		await repo.git.checkoutLocalBranch("next-work");
		newBranch = true;
		const current = await host.trpc.forkScm.workspace.query({ workspaceId });
		expect(current.branch).toBe("next-work");
		expect(current.pullRequest).toBeNull();
		expect(
			await host.trpc.git.getPullRequest.query({ workspaceId }),
		).toBeNull();
	} finally {
		await scenario.dispose();
	}
});
