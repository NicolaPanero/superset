import { afterEach, expect, test } from "bun:test";
import type {
	ForkConnection,
	ForkTask,
} from "@superset/shared/fork-integrations";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { waitFor } from "@testing-library/react";
import { initTRPC } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { ReactNode } from "react";
import { LocalHostServiceContext } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import {
	act,
	fireEvent,
	queryFixture,
	render,
	renderHook,
} from "renderer/test-utils/fork-ui";
import superjson from "superjson";
import { z } from "zod";
import { ForkTaskTransitionDialog } from "./components/ForkTaskTransitionDialog/ForkTaskTransitionDialog";
import { ForkToday } from "./components/ForkToday";
import { ForkUnloggedTasks } from "./components/ForkToday/components/ForkUnloggedTasks";
import { useForkTaskTransition } from "./hooks/useForkTaskTransition";

const task: ForkTask = {
	id: "1",
	key: "J-1",
	connectionId: "jira",
	title: "No logged time",
	description: "",
	url: "https://jira.test/J-1",
	status: { id: "3", name: "In progress", category: "indeterminate" },
	priority: null,
	assignee: null,
	labels: [],
};
const transition = {
	id: "61",
	name: "Resolve",
	to: { id: "5", name: "Resolved", category: "done" },
	fields: [
		{
			id: "customfield_reason",
			name: "Closing reason",
			required: false,
			schema: { type: "string", custom: "jira:textarea" },
		},
	],
};

const servers: ReturnType<typeof Bun.serve>[] = [];
afterEach(() => {
	for (const server of servers.splice(0)) server.stop(true);
});

function fixture(
	today = false,
	attempts: {
		id: string;
		state: string;
		title: string;
		updatedAt: number;
	}[] = [],
) {
	const requests: { jql: string; cursor?: string }[] = [];
	const mutations: unknown[] = [];
	const t = initTRPC.create({ transformer: superjson });
	const router = t.router({
		forkConnections: t.router({
			list: t.procedure.query(() => ({
				version: 10,
				connections: today
					? [{ id: "jira", label: "Jira", provider: "jira", enabled: true }]
					: [],
			})),
		}),
		project: t.router({ list: t.procedure.query(() => []) }),
		forkTasks: t.router({
			automationAttempts: t.procedure.input(z.any()).query(() => attempts),
			list: t.procedure.input(z.any()).query(({ input }) => {
				requests.push(input);
				return {
					items: [{ ...task, key: input.cursor ? "J-2" : "J-1" }],
					nextCursor: input.cursor ? null : "next",
				};
			}),
			transitions: t.procedure.input(z.any()).query(() => [transition]),
			transition: t.procedure.input(z.any()).mutation(({ input }) => {
				mutations.push(input);
				return task;
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
	return { query, wrap, requests, mutations };
}

test("unlogged tasks paginate and changing the period restarts from the first page", async () => {
	const f = fixture();
	const connection = { id: "jira", label: "Jira" } as ForkConnection;
	const root = createRootRoute();
	const page = createRoute({
		getParentRoute: () => root,
		path: "/",
		component: () => <ForkUnloggedTasks connection={connection} days={30} />,
	});
	const router = createRouter({
		routeTree: root.addChildren([page]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	const view = render(f.wrap(<RouterProvider router={router} />), {
		wrapper: f.query.wrapper,
	});
	await view.findByText("J-1");
	fireEvent.click(view.getByRole("button", { name: "Load more" }));
	await view.findByText("J-2");
	expect(f.requests[1]?.cursor).toBe("next");
	const jql = f.requests[0]?.jql ?? "";
	expect(jql).toContain('statusCategory in ("In Progress", Done)');
	expect(jql).toContain("(timespent is EMPTY OR timespent = 0)");
	expect(jql).toContain("updated >= -30d");
	view.unmount();
	const r = createRootRoute({
		component: () => <ForkUnloggedTasks connection={connection} days={7} />,
	});
	const router7 = createRouter({
		routeTree: r,
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	const v7 = render(f.wrap(<RouterProvider router={router7} />), {
		wrapper: f.query.wrapper,
	});
	await v7.findByText("J-1");
	expect(v7.queryByText("J-2")).toBeNull();
	expect(f.requests.at(-1)?.jql).toContain("updated >= -7d");
	expect(f.requests.at(-1)?.cursor).toBeUndefined();
});

test("optional transition fields open a form without writing and only Save sends their values", async () => {
	const f = fixture();
	const { result } = renderHook(
		() => useForkTaskTransition(task, true, () => {}),
		{
			wrapper: ({ children }) => (
				<f.query.wrapper>{f.wrap(children)}</f.query.wrapper>
			),
		},
	);
	await waitFor(() => expect(result.current.transitions.data?.length).toBe(1));
	act(() => result.current.choose(transition));
	const view = render(
		f.wrap(<ForkTaskTransitionDialog change={result.current} />),
		{ wrapper: f.query.wrapper },
	);
	const reason = await view.findByLabelText("Closing reason");
	expect(f.mutations).toEqual([]);
	fireEvent.change(reason, { target: { value: "Finished and verified" } });
	fireEvent.click(view.getByRole("button", { name: "Save" }));
	await waitFor(() => expect(f.mutations).toHaveLength(1));
	expect(f.mutations[0]).toMatchObject({
		transitionId: "61",
		fields: { customfield_reason: "Finished and verified" },
	});
});

test("Today period controls and refresh keep manual task navigation available", async () => {
	const f = fixture(true);
	const root = createRootRoute({ component: ForkToday });
	const router = createRouter({
		routeTree: root,
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	const view = render(f.wrap(<RouterProvider router={router} />), {
		wrapper: f.query.wrapper,
	});
	await view.findByText("J-1");
	expect(
		view
			.getByRole("link", { name: /J-1.*No logged time/ })
			.getAttribute("href"),
	).toContain("forkTask=J-1");
	fireEvent.click(view.getByRole("button", { name: "7 days" }));
	await waitFor(() =>
		expect(f.requests.at(-1)?.jql).toContain("updated >= -7d"),
	);
	fireEvent.click(view.getByRole("button", { name: "90 days" }));
	await waitFor(() =>
		expect(f.requests.at(-1)?.jql).toContain("updated >= -90d"),
	);
	const previous = f.requests.length;
	fireEvent.click(view.getByRole("button", { name: "Refresh" }));
	await waitFor(() => expect(f.requests.length).toBeGreaterThan(previous));
	expect(f.mutations).toEqual([]);
	expect(view.getByText("Nothing to check.")).toBeDefined();
});

test("Today keeps waiting agents visible while omitting finished and empty automation groups", async () => {
	const f = fixture(true, [
		{
			id: "wait",
			state: "waiting_input",
			title: "Review the result",
			updatedAt: Date.now(),
		},
		{
			id: "done",
			state: "verified",
			title: "Finished yesterday",
			updatedAt: Date.now(),
		},
	]);
	const root = createRootRoute({ component: ForkToday });
	const router = createRouter({
		routeTree: root,
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	const view = render(f.wrap(<RouterProvider router={router} />), {
		wrapper: f.query.wrapper,
	});
	await view.findByText("Review the result");
	expect(
		view.getByRole("heading", { name: /Agents waiting for you/ }),
	).toBeDefined();
	expect(view.queryByRole("heading", { name: /Runs to check/ })).toBeNull();
	expect(view.queryByText("Finished yesterday")).toBeNull();
});
