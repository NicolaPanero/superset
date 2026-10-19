import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { forkProviderFixture } from "../../test/helpers/fork-provider-fixture";
import type { HostDb } from "../db";
import { forkWorkspacePullRequests } from "../db/fork-schema";
import { ensureForkTables } from "../db/fork-tables";
import type { HostServiceContext } from "../types";
import type { forkFetch } from "./fork-http";
import { forkServices } from "./fork-services";
import { forkRefreshSidebarPullRequest } from "./fork-sidebar-pull-requests";
import { ForkConnectionStore } from "./fork-store";

test("an in-flight Bitbucket refresh cannot replace a newer workspace PR link", async () => {
	const sqlite = new Database(":memory:");
	sqlite.exec(
		"CREATE TABLE workspaces(id text PRIMARY KEY); INSERT INTO workspaces VALUES ('ws');",
	);
	ensureForkTables(sqlite);
	const db = drizzle(sqlite) as unknown as HostDb;
	try {
		const store = new ForkConnectionStore(db, "org");
		const account = store.create("bitbucket", "token", null);
		store.save(account, { token: "bb-one", email: "qa@example.test" });
		const fixture = forkProviderFixture();
		const ctx = {
			db,
			organizationId: "org",
			credentials: {},
			forkTransport: fixture.transport,
		} as unknown as HostServiceContext;
		const { scm } = forkServices(ctx);
		const stored = await scm.get(
			account.id,
			{
				provider: "bitbucket",
				host: "bitbucket.org",
				owner: "team",
				name: "app",
			},
			7,
		);
		db.insert(forkWorkspacePullRequests)
			.values({ scope: "org", workspaceId: "ws", pullRequest: stored })
			.run();
		const entered = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		ctx.forkTransport = (async (url, init) => {
			entered.resolve();
			await release.promise;
			return fixture.transport(url, init);
		}) as typeof forkFetch;
		const refreshing = forkRefreshSidebarPullRequest(ctx, "ws", stored);
		await entered.promise;
		const newer = { ...stored, number: 8, title: "A newer review" };
		db.update(forkWorkspacePullRequests).set({ pullRequest: newer }).run();
		release.resolve();
		await refreshing;
		expect(
			db.select().from(forkWorkspacePullRequests).get()?.pullRequest,
		).toEqual(newer);
	} finally {
		sqlite.close();
	}
});
