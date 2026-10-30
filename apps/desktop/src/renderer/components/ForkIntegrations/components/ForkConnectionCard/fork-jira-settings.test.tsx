import { afterEach, expect, test } from "bun:test";
import { waitFor } from "@testing-library/react";
import { initTRPC, TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { ReactNode } from "react";
import { LocalHostServiceContext } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import { fireEvent, queryFixture, render } from "renderer/test-utils/fork-ui";
import superjson from "superjson";
import { z } from "zod";
import { ForkJiraProjectPicker } from "./components/ForkJiraProjectPicker";
import { ForkJiraStatusMapping } from "./components/ForkJiraStatusMapping";

const servers: ReturnType<typeof Bun.serve>[] = [];
afterEach(() => {
	for (const server of servers.splice(0)) server.stop(true);
});

function fixture(failMapping = false) {
	const writes: unknown[] = [];
	const mappings: Record<
		string,
		{ progressStatusId: string | null; reviewStatusId: string | null }
	> = { B4BN: { progressStatusId: "3", reviewStatusId: null } };

	const t = initTRPC.create({ transformer: superjson });
	const router = t.router({
		forkConnections: t.router({
			list: t.procedure.query(() => ({ version: 10, connections: [] })),
		}),
		forkTasks: t.router({
			projectStatuses: t.procedure.input(z.any()).query(() => [
				{ id: "1", name: "Open", category: "new" },
				{ id: "3", name: "In Progress", category: "indeterminate" },
				{ id: "4", name: "Review", category: "indeterminate" },
			]),
			statusMapping: t.procedure.input(z.any()).query(({ input }) => {
				if (failMapping) {
					failMapping = false;
					throw new TRPCError({
						code: "BAD_GATEWAY",
						message: "Workflow unavailable",
					});
				}
				return mappings[input.projectKey] ?? null;
			}),
			setStatusMapping: t.procedure.input(z.any()).mutation(({ input }) => {
				writes.push(input);
				mappings[input.projectKey] = {
					progressStatusId: input.progressStatusId,
					reviewStatusId: input.reviewStatusId,
				};
				return { ok: true };
			}),
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
	return { query, wrap, writes };
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

test("workflow choices save only to their project and survive selecting the same project again", async () => {
	const f = fixture();
	const view = render(f.wrap(<ForkJiraStatusMapping connectionId="jira" />), {
		wrapper: f.query.wrapper,
	});
	fireEvent.click(view.getByRole("button", { name: /Workflow statuses/ }));
	fireEvent.click(view.getByRole("combobox", { name: "Jira project" }));
	fireEvent.click(await view.findByRole("option", { name: /Business Travel/ }));
	const progress = view.getByRole("combobox", { name: /Work started/ });
	await waitFor(() => expect(progress.textContent).toContain("In Progress"));
	fireEvent.click(view.getByRole("combobox", { name: /Pull request opened/ }));
	fireEvent.click(await view.findByRole("option", { name: "Review" }));
	expect(view.getByRole("status").textContent).toContain("Unsaved changes");
	fireEvent.click(view.getByRole("button", { name: "Save" }));
	await waitFor(() => expect(f.writes).toHaveLength(1));
	expect(f.writes[0]).toEqual({
		connectionId: "jira",
		projectKey: "B4BN",
		progressStatusId: "3",
		reviewStatusId: "4",
	});
	await waitFor(() =>
		expect(view.getByRole("status").textContent).toContain("Saved"),
	);
	fireEvent.click(view.getByRole("combobox", { name: "Jira project" }));
	fireEvent.click(await view.findByRole("option", { name: /Business Travel/ }));
	expect(progress.textContent).toContain("In Progress");
	expect(
		view.getByRole("combobox", { name: /Pull request opened/ }).textContent,
	).toContain("Review");
	fireEvent.click(view.getByRole("combobox", { name: "Jira project" }));
	fireEvent.click(await view.findByRole("option", { name: /Enterprise/ }));
	await waitFor(() => expect(progress.textContent).toContain("Automatic"));
	expect(f.writes).toHaveLength(1);
});

test("an unavailable workflow offers Retry instead of saving unloaded defaults", async () => {
	const f = fixture(true);
	const view = render(f.wrap(<ForkJiraStatusMapping connectionId="jira" />), {
		wrapper: f.query.wrapper,
	});
	fireEvent.click(view.getByRole("button", { name: /Workflow statuses/ }));
	fireEvent.click(view.getByRole("combobox", { name: "Jira project" }));
	fireEvent.click(await view.findByRole("option", { name: /Business Travel/ }));
	await view.findByRole("alert");
	expect(
		(
			view.getByRole("button", {
				name: "Save",
			}) as HTMLButtonElement
		).disabled,
	).toBe(true);
	fireEvent.click(view.getByRole("button", { name: "Retry" }));
	await waitFor(() =>
		expect(
			view.getByRole("combobox", { name: /Work started/ }).textContent,
		).toContain("In Progress"),
	);
	expect(view.queryByRole("alert")).toBeNull();
	expect(f.writes).toEqual([]);
});
