import { expect, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import {
	clearTerminalBackgroundMarker,
	consumeTerminalBackgroundIntent,
	hasTerminalBackgroundIntent,
} from "renderer/lib/terminal/terminal-background-intents";
import type { PaneViewerData } from "../../types";
import { backgroundForkSetupTabs } from "./backgroundForkSetupTabs";

test("hiding automatic setup keeps the process alive and preserves a manually opened log tab", () => {
	const store = createWorkspaceStore<PaneViewerData>();
	store.getState().addTab({
		titleOverride: "Workspace Setup",
		panes: [{ kind: "terminal", data: { terminalId: "setup" } }],
	});
	store.getState().addTab({
		panes: [{ kind: "terminal", data: { terminalId: "manual-log" } }],
	});
	const backgrounded: string[] = [];
	store.getState().subscribePaneClose(([pane]) => {
		if (!pane) throw new Error("Missing closed pane");
		const id = (pane.data as { terminalId: string }).terminalId;
		expect(hasTerminalBackgroundIntent(id)).toBe(true);
		consumeTerminalBackgroundIntent(id);
		backgrounded.push(id);
	});
	backgroundForkSetupTabs(
		store,
		[
			{ terminalId: "setup", customTitle: "Workspace Setup" },
			{ terminalId: "manual-log", customTitle: "Workspace Setup" },
		],
		"fork-setup-test",
	);
	expect(backgrounded).toEqual(["setup"]);
	expect(store.getState().tabs).toHaveLength(1);
	clearTerminalBackgroundMarker("fork-setup-test", "setup");
});
