import { afterEach, expect, test } from "bun:test";
import type { ForkTask } from "@superset/shared/fork-integrations";
import { waitFor } from "@testing-library/react";
import { initTRPC } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { LocalHostServiceContext } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import { fireEvent, queryFixture, render } from "renderer/test-utils/fork-ui";
import superjson from "superjson";
import { z } from "zod";
import { ForkTaskWorkspacePicker } from "./ForkTaskWorkspacePicker";

const servers: ReturnType<typeof Bun.serve>[] = [];
afterEach(() => {
	for (const server of servers.splice(0)) server.stop(true);
});

test("workspace search links the selected result and disables existing links", async () => {
	const changes: unknown[] = [];
	const t = initTRPC.create({ transformer: superjson });
	const router = t.router({
		forkConnections: t.router({
			list: t.procedure.query(() => ({ version: 5, connections: [] })),
		}),
		workspace: t.router({
			list: t.procedure.query(() => [
				{
					id: "linked",
					name: "Task workspace",
					projectName: "Project",
					branch: "feature/linked",
				},
				{
					id: "target",
					name: "Task workspace",
					projectName: "Project",
					branch: "feature/target",
				},
			]),
		}),
		forkTasks: t.router({
			link: t.procedure.input(z.any()).mutation(({ input }) => {
				changes.push(input);
				return { ok: true };
			}),
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
	const task: ForkTask = {
		id: "issue-id",
		key: "TEST-1",
		connectionId: "jira",
		title: "Example task",
		description: "",
		url: "https://example.atlassian.net/browse/TEST-1",
		status: { id: "open", name: "Open", category: "new" },
		priority: null,
		assignee: null,
		labels: [],
	};
	const query = queryFixture();
	const view = render(
		<LocalHostServiceContext.Provider
			value={{
				machineId: "test",
				activeHostUrl: server.url.origin,
				activeOrganizationId: "test",
				activeOrganizationName: "Test",
				hostServiceStatus: "running",
				waitForHostReady: async () => server.url.origin,
			}}
		>
			<ForkTaskWorkspacePicker
				task={task}
				linkedWorkspaceIds={["linked"]}
				disabled={false}
			/>
		</LocalHostServiceContext.Provider>,
		{ wrapper: query.wrapper },
	);
	fireEvent.click(
		view.getByRole("button", { name: "Link existing workspace" }),
	);
	const existing = await view.findByRole("option", { name: /feature\/linked/ });
	expect(existing.getAttribute("aria-disabled")).toBe("true");
	fireEvent.change(view.getByRole("combobox", { name: "Search workspaces" }), {
		target: { value: "feature/target" },
	});
	await waitFor(() =>
		expect(view.queryByRole("option", { name: /feature\/linked/ })).toBeNull(),
	);
	const result = await view.findByRole("option", { name: /feature\/target/ });
	fireEvent.click(result);
	await waitFor(() =>
		expect(changes).toEqual([
			{ connectionId: "jira", key: "TEST-1", workspaceId: "target" },
		]),
	);
	await waitFor(() => expect(view.queryByRole("combobox")).toBeNull());
});
