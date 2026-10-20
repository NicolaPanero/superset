import { expect, test } from "bun:test";
import { forkIntegrationBindings } from "../../src/db/fork-schema";
import { ForkGitCredentialProvider } from "../../src/fork-integrations/fork-credentials";
import { ForkConnectionStore } from "../../src/fork-integrations/fork-store";
import { createGitEnvResolver } from "../../src/runtime/git";
import { createGitFixture } from "../helpers/git-fixture";
import { createBasicScenario } from "../helpers/scenarios";
import { seedProject } from "../helpers/seed";

const scope = "00000000-0000-0000-0000-000000000001";
test("worker Git environments keep separate checkout accounts while GitHub and Bitbucket coexist", async () => {
	const scenario = await createBasicScenario();
	const other = await createGitFixture();
	try {
		const store = new ForkConnectionStore(scenario.host.db, scope);
		const primary = store.create("bitbucket", "token", null);
		store.save(primary, { token: "bb-primary" });
		store.keepDefaultBefore("bitbucket");
		const second = store.create("bitbucket", "token", null);
		store.save(second, { token: "bb-second" });
		const gh = store.create("github", "token", null);
		store.save(gh, { token: "github-only" });
		const otherProject = seedProject(scenario.host, {
			repoPath: other.repoPath,
		});
		const repository = {
			provider: "bitbucket" as const,
			host: "bitbucket.org",
			owner: "team",
			name: "app",
		};
		await scenario.repo.git.addRemote(
			"origin",
			"https://bitbucket.org/team/app.git",
		);
		await other.git.addRemote("origin", "https://bitbucket.org/team/app.git");
		scenario.host.db
			.insert(forkIntegrationBindings)
			.values([
				{
					scope,
					projectId: scenario.projectId,
					repository,
					connectionId: primary.id,
					remote: "origin",
				},
				{
					scope,
					projectId: otherProject.id,
					repository,
					connectionId: second.id,
					remote: "origin",
				},
			])
			.run();
		const credentials = new ForkGitCredentialProvider(
			{
				getCredentials: async () => ({ env: {} }),
				getToken: async () => null,
				credentialRemedy: () => "Reconnect",
			},
			store,
			undefined,
			async () => ({}),
		);
		const resolve = createGitEnvResolver(credentials);
		const [a, b] = await Promise.all([
			resolve(scenario.repo.repoPath),
			resolve(other.repoPath),
		]);
		const header = (token: string) =>
			`Authorization: Basic ${Buffer.from(`x-bitbucket-api-token-auth:${token}`).toString("base64")}`;
		expect(a.GIT_CONFIG_VALUE_1).toBe(header("bb-primary"));
		expect(b.GIT_CONFIG_VALUE_1).toBe(header("bb-second"));
		expect(
			(await credentials.getCredentials("https://github.com/team/app.git")).env
				.GIT_CONFIG_VALUE_1,
		).toContain(Buffer.from("x-access-token:github-only").toString("base64"));
	} finally {
		other.dispose();
		await scenario.dispose();
	}
});
