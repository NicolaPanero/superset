import { expect, test } from "bun:test";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterContextProvider,
} from "@tanstack/react-router";
import { render } from "renderer/test-utils/fork-ui";
import type { DashboardSidebarRunningAgent } from "../../../../hooks/useDashboardSidebarWorkspaceRunningAgents";
import { DashboardSidebarAgentHoverRow } from "./DashboardSidebarAgentHoverRow";

test("the agent row shows and updates the session title while keeping its provider logo", () => {
	const router = createRouter({
		routeTree: createRootRoute(),
		history: createMemoryHistory(),
	});
	const agent: DashboardSidebarRunningAgent = {
		sourceKey: "terminal:one",
		source: { type: "terminal", id: "one" },
		terminalId: "one",
		agentId: "claude",
		status: "idle",
		startedAt: 1,
		label: "Claude",
		subagents: [],
	};
	const row = (sessionTitle?: string) => (
		<RouterContextProvider router={router}>
			<DashboardSidebarAgentHoverRow
				workspaceId="workspace"
				agent={agent}
				sessionTitle={sessionTitle}
			/>
		</RouterContextProvider>
	);
	const view = render(row("Fix the agent modal"));
	const logo = view.container.querySelector("img")?.getAttribute("src");
	expect(logo).toBeTruthy();
	expect(view.getByRole("button", { name: "Fix the agent modal" }).title).toBe(
		"Fix the agent modal",
	);
	view.rerender(row("My renamed session"));
	expect(
		view.getByRole("button", { name: "My renamed session" }),
	).toBeDefined();
	expect(view.container.querySelector("img")?.getAttribute("src")).toBe(logo);
	view.rerender(row());
	expect(view.getByRole("button", { name: "Claude" })).toBeDefined();
});
