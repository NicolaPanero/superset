import type { WorkspaceStore } from "@superset/panes";
import { isForkSetupTerminal } from "renderer/lib/fork-settings-visibility";
import { markTerminalForBackground } from "renderer/lib/terminal/terminal-background-intents";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, TerminalPaneData } from "../../types";

export function backgroundForkSetupTabs(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	sessions: readonly { terminalId: string; customTitle?: string | null }[],
	workspaceId: string,
): void {
	const setupIds = new Set(
		sessions.filter(isForkSetupTerminal).map((session) => session.terminalId),
	);
	for (const tab of store.getState().tabs) {
		if (!isForkSetupTerminal({ label: tab.titleOverride })) continue;
		const panes = Object.values(tab.panes);
		if (
			!panes.length ||
			!panes.every(
				(pane) =>
					pane.kind === "terminal" &&
					setupIds.has((pane.data as TerminalPaneData).terminalId),
			)
		)
			continue;
		for (const pane of panes)
			markTerminalForBackground(
				(pane.data as TerminalPaneData).terminalId,
				workspaceId,
			);
		store.getState().removeTab(tab.id);
	}
}
