import { expect, test } from "bun:test";
import { forkIntegrationBindings } from "../../src/db/fork-schema";
import { ForkConnectionStore } from "../../src/fork-integrations/fork-store";
import { forkProviderFixture } from "../helpers/fork-provider-fixture";
import { createBasicScenario } from "../helpers/scenarios";

const scope = "00000000-0000-0000-0000-000000000001";
const repository = {
	provider: "bitbucket" as const,
	host: "bitbucket.org",
	owner: "team",
	name: "app",
};

async function scenarioWithProviders() {
	const fixture = forkProviderFixture();
	const scenario = await createBasicScenario({
		hostOptions: { forkTransport: fixture.transport },
	});
	const { host, repo, projectId } = scenario;
	await repo.git.addRemote("origin", "git@bitbucket.org:team/app.git");
	const store = new ForkConnectionStore(host.db, scope);
	const jiraA = store.create("jira", "token", "https://one.atlassian.net");
	store.save(jiraA, { token: "jira-one", email: "one@example.test" });
	const jiraB = store.create("jira", "token", "https://two.atlassian.net");
	store.save(jiraB, { token: "jira-two", email: "two@example.test" });
	const bb = store.create("bitbucket", "token", null);
	store.save(bb, { token: "bb-one", email: "bb@example.test" });
	const gh = store.create("github", "token", null);
	store.save(gh, { token: "gh-one" });
	host.db
		.insert(forkIntegrationBindings)
		.values({
			scope,
			projectId,
			connectionId: bb.id,
			repository,
			remote: "origin",
		})
		.run();
	return { ...scenario, fixture, jiraA, jiraB, bb };
}

test("Jira sites, Bitbucket review and Git status work together without sharing identities", async () => {
	const scenario = await scenarioWithProviders();
	try {
		const { host, workspaceId, fixture, jiraA, jiraB, bb } = scenario;
		const target = { connectionId: bb.id, repository, number: 7 };
		const [a, b, pr, sync] = await Promise.all([
			host.trpc.forkTasks.get.query({ connectionId: jiraA.id, key: "APP-7" }),
			host.trpc.forkTasks.get.query({ connectionId: jiraB.id, key: "APP-7" }),
			host.trpc.forkScm.get.query(target),
			host.trpc.git.getBranchSyncStatus.query({ workspaceId }),
		]);
		expect([a.title, b.title]).toEqual(["Site one issue", "Site two issue"]);
		expect(a.sprint).toBe("Sprint 7");
		expect(pr.url).toContain("bitbucket.org");
		expect(sync.hasRepo).toBe(true);
		await host.trpc.forkTasks.startWork.mutate({
			workspaceId,
			connectionId: jiraA.id,
			key: "APP-7",
			taskId: "forged",
			title: "Forged title",
			url: "https://wrong.test/",
		});
		expect(
			await host.trpc.forkTasks.links.query({ workspaceId }),
		).toMatchObject([
			{ taskId: "10007", title: "Site one issue", connectionId: jiraA.id },
		]);
		expect(fixture.issues.get("jira-one")?.status).toBe("In Progress");
		expect(fixture.issues.get("jira-two")?.status).toBe("To Do");
		await Promise.all([
			host.trpc.forkScm.action.mutate({ ...target, action: "approve" }),
			host.trpc.forkScm.action.mutate({
				...target,
				action: "comment",
				body: "Keep validation",
				path: "src/login.ts",
				line: 12,
				side: "old",
			}),
			host.trpc.forkTasks.transition.mutate({
				connectionId: jiraA.id,
				key: "APP-7",
				transitionId: "review",
			}),
		]);
		const comments = await host.trpc.forkScm.comments.query(target);
		expect(comments.items[0]).toMatchObject({
			path: "src/login.ts",
			line: 12,
			side: "old",
		});
		expect(
			fixture.calls
				.filter((call) => call.host === "api.bitbucket.org")
				.every((call) => call.account === "bb-one"),
		).toBe(true);
		expect(
			fixture.calls
				.filter((call) => call.host === "one.atlassian.net")
				.every((call) => call.account === "jira-one"),
		).toBe(true);
		expect(
			fixture.calls
				.filter((call) => call.host === "two.atlassian.net")
				.every((call) => call.account === "jira-two"),
		).toBe(true);
		await expect(
			host.unauthenticatedTrpc.forkTasks.get.query({
				connectionId: jiraA.id,
				key: "APP-7",
			}),
		).rejects.toMatchObject({ data: { code: "UNAUTHORIZED" } });
	} finally {
		await scenario.dispose();
	}
});

test("Jira automation CRUD stays isolated to its connection and starts paused", async () => {
	const scenario = await scenarioWithProviders();
	try {
		const { host, projectId, jiraA, jiraB } = scenario;
		const rule = await host.trpc.forkTasks.automationCreate.mutate({
			connectionId: jiraA.id,
			projectId,
			name: "Ready issues",
			jql: "labels = ready",
			agent: "fixture-agent",
			prompt: "Implement the issue",
		});
		expect(
			(
				await host.trpc.forkTasks.automationList.query({
					connectionId: jiraA.id,
				})
			)[0],
		).toMatchObject({ id: rule.id, enabled: false });
		expect(
			await host.trpc.forkTasks.automationList.query({
				connectionId: jiraB.id,
			}),
		).toEqual([]);
		await host.trpc.forkTasks.automationEnable.mutate({
			id: rule.id,
			enabled: true,
		});
		await host.trpc.forkTasks.automationEnable.mutate({
			id: rule.id,
			enabled: false,
		});
		await host.trpc.forkTasks.automationDelete.mutate({ id: rule.id });
		expect(
			await host.trpc.forkTasks.automationList.query({
				connectionId: jiraA.id,
			}),
		).toEqual([]);
		expect(
			await host.trpc.forkTasks.automationRuns.query({ id: rule.id }),
		).toEqual([]);
	} finally {
		await scenario.dispose();
	}
});
