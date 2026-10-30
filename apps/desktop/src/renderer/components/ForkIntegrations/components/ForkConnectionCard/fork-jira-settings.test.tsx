import { afterEach, expect, test } from "bun:test";
import { waitFor } from "@testing-library/react";
import { initTRPC } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { ReactNode } from "react";
import { LocalHostServiceContext } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import { fireEvent, queryFixture, render } from "renderer/test-utils/fork-ui";
import superjson from "superjson";
import { z } from "zod";
import { ForkJiraProjectPicker } from "./components/ForkJiraProjectPicker";

const servers: ReturnType<typeof Bun.serve>[] = [];
afterEach(() => {
	for (const server of servers.splice(0)) server.stop(true);
});

function fixture() {
	const t = initTRPC.create({ transformer: superjson });
	const router = t.router({
		forkConnections: t.router({
			list: t.procedure.query(() => ({ version: 10, connections: [] })),
		}),
		forkTasks: t.router({
			projects: t.procedure.input(z.any()).query(() => [
				{ id: "1", key: "B4BN", name: "Business Travel" },
				{ id: "2", key: "ERP", name: "Enterprise" },
			]),
		}),
	});
	const server = Bun.serve({
		port: 0,
		fetch: (req) =>
			fetchRequestHandler({
				req,
				endpoint: "/trpc",
				router,
				createContext: () => ({}),
				allowMethodOverride: true,
			}),
	});
	servers.push(server);
	const query = queryFixture();
	const wrap = (children: ReactNode) => (
		<LocalHostServiceContext.Provider
			value={{
				machineId: "m",
				activeHostUrl: server.url.origin,
				activeOrganizationId: "org",
				activeOrganizationName: "Test",
				hostServiceStatus: "running",
				waitForHostReady: async () => server.url.origin,
			}}
		>
			{children}
		</LocalHostServiceContext.Provider>
	);
	return { query, wrap };
}

test("Jira projects can be found by their name or key and picking one returns its key", async () => {
	const f = fixture();
	const choices: string[] = [];
	const view = render(
		f.wrap(
			<ForkJiraProjectPicker
				connectionId="jira"
				value=""
				onChange={(key) => choices.push(key)}
			/>,
		),
		{ wrapper: f.query.wrapper },
	);
	fireEvent.click(view.getByRole("combobox"));
	await view.findByRole("option", { name: /Business Travel/ });
	const search = view.getByPlaceholderText("Search projects...");
	fireEvent.change(search, { target: { value: "Business" } });
	await waitFor(() =>
		expect(view.queryByRole("option", { name: /Enterprise/ })).toBeNull(),
	);
	fireEvent.change(search, { target: { value: "B4BN" } });
	fireEvent.click(await view.findByRole("option", { name: /Business Travel/ }));
	expect(choices).toEqual(["B4BN"]);
	await waitFor(() => expect(view.queryByRole("option")).toBeNull());
});

test("a saved project key stays visible if it is not in the returned list", async () => {
	const f = fixture();
	const choices: string[] = [];
	const view = render(
		f.wrap(
			<ForkJiraProjectPicker
				connectionId="jira"
				value="LEGACY"
				onChange={(key) => choices.push(key)}
			/>,
		),
		{ wrapper: f.query.wrapper },
	);
	const trigger = view.getByRole("combobox");
	fireEvent.click(trigger);
	await view.findByRole("option", { name: /Business Travel/ });
	expect(trigger.textContent).toContain("LEGACY");
	expect(choices).toEqual([]);
});
