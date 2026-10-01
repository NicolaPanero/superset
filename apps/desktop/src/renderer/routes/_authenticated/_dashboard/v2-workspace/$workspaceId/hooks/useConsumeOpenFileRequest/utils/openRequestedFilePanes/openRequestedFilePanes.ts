import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { OpenFile, PaneViewerData } from "../../../../types";
import type { V2WorkspaceUrlOpenTarget } from "../../../../utils/openUrlInV2Workspace";

export interface OpenFilePanesRequest {
	paths: string[];
	line?: number;
	target: V2WorkspaceUrlOpenTarget;
}

/**
 * Opens one pane per path and returns their ids in order. A single file
 * behaves like a file-tree click (it may replace the unpinned preview pane).
 * With several files, each pane but the last is pinned as it opens, or the
 * next open would replace it as the preview. With `new-tab` only the first
 * file starts a tab; the rest split beside it so one request lands in one
 * place. The line applies to the first file, matching `--line`'s single-path
 * contract in the CLI.
 */
export function openRequestedFilePanes(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	request: OpenFilePanesRequest,
	openFilePane: OpenFile,
): string[] {
	const paneIds: string[] = [];
	request.paths.forEach((path, index) => {
		const first = index === 0;
		const last = index === request.paths.length - 1;
		openFilePane(
			path,
			first && request.target === "new-tab",
			first && request.line !== undefined ? { line: request.line } : undefined,
		);
		const state = store.getState();
		const paneId = state.getActivePane()?.pane.id;
		if (!paneId) return;
		if (!last) state.setPanePinned({ paneId, pinned: true });
		if (!paneIds.includes(paneId)) paneIds.push(paneId);
	});
	return paneIds;
}
