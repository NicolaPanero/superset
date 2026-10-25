import type { WorkspaceStore } from "@superset/panes";
import { workspaceTrpc } from "@superset/workspace-client";
import { useEffect } from "react";
import { isForkSetupTerminal } from "renderer/lib/fork-settings-visibility";
import { logStressEvent } from "renderer/lib/performance/stress-instrumentation";
import { getTerminalBackgroundMarkerIdsKey } from "renderer/lib/terminal/terminal-background-intents";
import { useForkCliOptionsStore } from "renderer/stores/fork-cli-options";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";
import {
	getAttachedTerminalIdsKey,
	getBackgroundTerminalSessions,
	parseAttachedTerminalIdsKey,
} from "../../utils/backgroundTerminals";
import { isTerminalReplacementCancelled } from "../../utils/cancelledTerminalReplacements";
import { focusOrAddTerminalPane } from "../../utils/focusTerminalPane";
import { backgroundForkSetupTabs } from "./backgroundForkSetupTabs";

interface UseAutoAdoptBackgroundSessionsArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	linkedStores: readonly StoreApi<WorkspaceStore<PaneViewerData>>[];
	workspaceId: string;
	isLayoutReady: boolean;
}

/**
 * When a workspace is opened, running terminal daemon sessions that have no
 * pane get their panes created automatically instead of sitting behind the
 * background-terminals dropdown — this is the only surface for sessions
 * launched outside the desktop (e.g. `superset workspaces create --agent …`
 * from the CLI, which writes no pane layout of its own).
 *
 * Gated on pane-layout hydration so the attached-pane check runs against the
 * real layout, not an empty store. The adoption itself is idempotent —
 * already-attached panes are filtered out and re-adoption just focuses the
 * existing pane — so it reruns freely as the session list settles. That's
 * what lets a session that lands slightly after open (a CLI race, a poll
 * refresh) still get a pane, instead of being stranded by a one-shot pass
 * that fired on a premature or empty list. Deliberately backgrounded sessions
 * (marker set) are always skipped.
 */
export function useAutoAdoptBackgroundSessions({
	store,
	linkedStores,
	workspaceId,
	isLayoutReady,
}: UseAutoAdoptBackgroundSessionsArgs): void {
	const hideCliOptions = useForkCliOptionsStore(
		(state) => state.hideCliOptions,
	);
	const sessionsQuery = workspaceTrpc.terminal.list.useQuery(
		{ workspaceId },
		{ enabled: isLayoutReady, refetchOnWindowFocus: false },
	);
	const sessions = sessionsQuery.data?.sessions;
	// Don't act on a cached list still being refetched — it may name a session
	// killed while the workspace was closed, which would adopt a ghost pane.
	const isFetchingSessions = sessionsQuery.isFetching;

	useEffect(() => {
		if (!isLayoutReady || !sessions || isFetchingSessions) return;

		if (hideCliOptions) {
			for (const target of [store, ...linkedStores])
				backgroundForkSetupTabs(target, sessions, workspaceId);
		}
		const state = store.getState();
		const marked = new Set(
			parseAttachedTerminalIdsKey(
				getTerminalBackgroundMarkerIdsKey(workspaceId),
			),
		);
		const toAdopt = getBackgroundTerminalSessions(
			sessions,
			parseAttachedTerminalIdsKey(
				getAttachedTerminalIdsKey([
					...state.tabs,
					...linkedStores.flatMap((linked) => linked.getState().tabs),
				]),
			),
		).filter(
			(session) =>
				(!hideCliOptions || !isForkSetupTerminal(session)) &&
				(!marked.has(session.terminalId) ||
					(!hideCliOptions && isForkSetupTerminal(session))) &&
				!isTerminalReplacementCancelled(session.terminalId),
		);
		if (toAdopt.length === 0) return;

		// Oldest→newest so tabs read chronologically; restore the active tab so
		// adoption never steals focus.
		const restoreActiveTabId = state.tabs.length > 0 ? state.activeTabId : null;
		for (const session of toAdopt.reverse()) {
			const setup = isForkSetupTerminal(session);
			focusOrAddTerminalPane(store, session.terminalId, { focus: setup });
			if (setup) {
				const location = store.getState().getActivePane();
				if (location)
					store.getState().setTabTitleOverride({
						tabId: location.tabId,
						titleOverride: "Workspace Setup",
					});
			}
		}
		if (restoreActiveTabId) {
			store.getState().setActiveTab(restoreActiveTabId);
		}
		logStressEvent("background-terminals.auto-adopt", {
			count: toAdopt.length,
			workspaceId,
		});
	}, [
		isLayoutReady,
		hideCliOptions,
		isFetchingSessions,
		sessions,
		store,
		linkedStores,
		workspaceId,
	]);
}
