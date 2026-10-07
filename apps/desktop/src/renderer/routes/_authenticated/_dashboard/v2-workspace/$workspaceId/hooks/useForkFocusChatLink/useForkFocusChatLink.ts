import type { WorkspaceStore } from "@superset/panes";
import { useEffect, useRef } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, TerminalPaneData } from "../../types";
import { findTerminalPaneLocation } from "../../utils/focusTerminalPane";
import { useForkBackgroundChats } from "../useForkBackgroundChats";

/**
 * A `?terminalId` link to an ACP chat (the sidebar's agent rows) focuses its
 * pane, or reopens it from the background chats. Upstream's link handler
 * only accepts terminals with a live pty, which a chat never has.
 */
export function useForkFocusChatLink(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	workspaceId: string,
	terminalId: string | undefined,
	focusRequestId: string | undefined,
): void {
	const { chats, reopen } = useForkBackgroundChats(workspaceId);
	const handled = useRef<string | null>(null);

	useEffect(() => {
		if (!terminalId) return;
		const key = `${terminalId}:${focusRequestId ?? ""}`;
		if (handled.current === key) return;
		const state = store.getState();
		const location = findTerminalPaneLocation(state, terminalId);
		if (location) {
			handled.current = key;
			const pane = state.tabs.find((tab) => tab.id === location.tabId)?.panes[
				location.paneId
			];
			if ((pane?.data as Partial<TerminalPaneData>)?.agentSurface !== "acp")
				return;
			state.setActiveTab(location.tabId);
			state.setActivePane(location);
			return;
		}
		const parked = chats.find((chat) => chat.terminalId === terminalId);
		if (!parked) return;
		handled.current = key;
		reopen(store, parked);
	}, [store, terminalId, focusRequestId, chats, reopen]);
}
