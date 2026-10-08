import type { WorkspaceStore } from "@superset/panes";
import { useEffect, useState } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, TerminalPaneData } from "../../types";
import { findTerminalPaneLocation } from "../../utils/focusTerminalPane";
import { useForkBackgroundChats } from "../useForkBackgroundChats";

/**
 * A `?terminalId` link to an ACP chat (the sidebar's agent rows, a chat
 * imported from another workspace) focuses its pane, or reopens it from the
 * background chats. Upstream's link handler only accepts terminals with a
 * live pty, which a chat never has, and it may clear the link before the
 * background chats have loaded, so the request is kept until it is served.
 */
export function useForkFocusChatLink(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	workspaceId: string,
	terminalId: string | undefined,
	focusRequestId: string | undefined,
): void {
	const { chats, reopen } = useForkBackgroundChats(workspaceId);
	const [request, setRequest] = useState<string | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: a new focusRequestId is a new click on the same chat
	useEffect(() => {
		if (terminalId) setRequest(terminalId);
	}, [terminalId, focusRequestId]);

	useEffect(() => {
		if (!request) return;
		const state = store.getState();
		const location = findTerminalPaneLocation(state, request);
		if (location) {
			setRequest(null);
			const pane = state.tabs.find((tab) => tab.id === location.tabId)?.panes[
				location.paneId
			];
			if ((pane?.data as Partial<TerminalPaneData>)?.agentSurface !== "acp")
				return;
			state.setActiveTab(location.tabId);
			state.setActivePane(location);
			return;
		}
		const parked = chats.find((chat) => chat.terminalId === request);
		if (!parked) return;
		setRequest(null);
		reopen(store, parked);
	}, [store, request, chats, reopen]);
}
