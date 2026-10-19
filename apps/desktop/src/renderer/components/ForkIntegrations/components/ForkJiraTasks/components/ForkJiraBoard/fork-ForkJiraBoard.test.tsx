import { afterEach, expect, test } from "bun:test";
import type { ForkTask } from "@superset/shared/fork-integrations";
import { waitFor } from "@testing-library/react";
import { initTRPC } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { LocalHostServiceContext } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import {
	fireEvent,
	flush,
	queryFixture,
	render,
} from "renderer/test-utils/fork-ui";
import superjson from "superjson";
import { z } from "zod";
import { ForkJiraBoard } from "./ForkJiraBoard";

const servers: ReturnType<typeof Bun.serve>[] = [];
afterEach(() => {
	for (const server of servers.splice(0)) server.stop(true);
});
const columns = [
	{ id: "todo", name: "To Do", statusIds: ["open"] },
	{ id: "progress", name: "In Progress", statusIds: ["testing", "review"] },
	{ id: "done", name: "Done", statusIds: ["resolved"] },
];
const task: ForkTask = {
	id: "1",
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
function fixture() {
	const changes: unknown[] = [];
	const t = initTRPC.create({ transformer: superjson });
	const router = t.router({
		forkConnections: t.router({
			list: t.procedure.query(() => ({
				version: 5,
				connections: [],
				jiraConfigured: true,
			})),
		}),
		forkTasks: t.router({
			transitions: t.procedure.input(z.any()).query(() => [
				{
					id: "testing",
					name: "Start testing",
					to: { id: "testing", name: "Testing", category: "indeterminate" },
					fields: [],
				},
				{
					id: "review",
					name: "Start review",
					to: { id: "review", name: "Review", category: "indeterminate" },
					fields: [],
				},
				{
					id: "resolve",
					name: "Resolve",
					to: { id: "resolved", name: "Resolved", category: "done" },
					fields: [
						{
							id: "resolution",
							name: "Resolution",
							required: true,
							schema: { type: "option" },
							allowedValues: [{ id: "fixed", name: "Fixed" }],
						},
					],
				},
			]),
			transition: t.procedure.input(z.any()).mutation(({ input }) => {
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
			<ForkJiraBoard tasks={[task]} columns={columns} onSelect={() => {}} />
		</LocalHostServiceContext.Provider>,
		{ wrapper: query.wrapper },
	);
	return { view, changes, query };
}

test("opening status choices keeps the board's configured columns", async () => {
	const { view } = fixture();
	await flush();
	const trigger = await view.findByRole("button", {
		name: "Change status of TEST-1",
	});
	fireEvent.click(trigger);
	await view.findByText("Testing", { exact: true });
	expect(
		view
			.getAllByRole("heading", { level: 2 })
			.map((heading) => heading.textContent),
	).toEqual(["To Do", "In Progress", "Done"]);
	expect(view.queryByRole("button", { name: "Move" })).toBeNull();
});

test("a drop into a column with several statuses asks before changing Jira", async () => {
	const { view, changes, query } = fixture();
	await view.findByRole("button", { name: "Change status of TEST-1" });
	const values = new Map<string, string>();
	const transfer = {
		setData: (key: string, value: string) => values.set(key, value),
		getData: (key: string) => values.get(key) ?? "",
		effectAllowed: "",
		dropEffect: "",
	};
	fireEvent.dragStart(view.getByRole("group", { name: "TEST-1" }), {
		dataTransfer: transfer,
	});
	await waitFor(() => expect(query.client.isFetching()).toBe(0));
	fireEvent.drop(view.getByRole("region", { name: "In Progress" }), {
		dataTransfer: transfer,
	});
	await view.findByRole("dialog");
	expect(view.getByText("Testing", { exact: true })).toBeDefined();
	expect(view.getByText("Review", { exact: true })).toBeDefined();
	expect(changes).toHaveLength(0);
});

test("a status change waits for required Jira fields before submitting", async () => {
	const { view, changes } = fixture();
	await view.findByRole("button", { name: "Change status of TEST-1" });
	fireEvent.click(
		view.getByRole("button", { name: "Change status of TEST-1" }),
	);
	fireEvent.click(
		await view.findByRole("button", { name: "Resolved Resolve" }),
	);
	await view.findByRole("dialog");
	expect(changes).toHaveLength(0);
	fireEvent.change(view.getByLabelText("Resolution *"), {
		target: { value: "fixed" },
	});
	fireEvent.click(view.getByRole("button", { name: "Save" }));
	await waitFor(() => expect(changes).toHaveLength(1));
	expect(changes[0]).toMatchObject({
		key: "TEST-1",
		transitionId: "resolve",
		fields: { resolution: { id: "fixed" } },
	});
});
