import { errorMessage } from "@superset/i18n/errors";
import type { Pane, PaneRegistry, WorkspaceStore } from "@superset/panes";
import type { TerminalRecoverySnapshot } from "@superset/shared/terminal-recovery";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useMemo, useRef } from "react";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import type { StoreApi } from "zustand";
import type {
	BrowserPaneData,
	FilePaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";

export function usePaneRecovery(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	workspaceId: string,
) {
	const utils = workspaceTrpc.useUtils();
	const close = workspaceTrpc.paneRecovery.close.useMutation();
	const restoreMutation = workspaceTrpc.paneRecovery.restore.useMutation();
	const acknowledge = workspaceTrpc.paneRecovery.acknowledge.useMutation();
	const history = workspaceTrpc.paneRecovery.list.useQuery(
		{ workspaceId },
		{ refetchInterval: 2000 },
	);
	const prepared = useRef(new Map<string, string>());
	const restoring = useRef(false);
	const committed = useRef(new Set<string>());
	const restore = useCallback(
		async (id: string) => {
			if (restoring.current) return;
			restoring.current = true;
			try {
				const result = await restoreMutation.mutateAsync({
					workspaceId,
					id,
				});
				const row = result.entry;
				const paneId = `restored-${row.id}`;
				const state = store.getState();
				const existing = state.getPane(paneId);
				if (existing) {
					state.setActiveTab(existing.tabId);
					state.setActivePane({ tabId: existing.tabId, paneId });
				} else {
					const data: PaneViewerData =
						row.kind === "terminal"
							? {
									terminalId: row.descriptor.terminalId,
									createOnAttach: row.freshShell,
								}
							: row.kind === "file"
								? { filePath: row.descriptor.filePath, mode: "editor" }
								: { url: row.descriptor.url };
					state.addTab({
						id: `restored-tab-${row.id}`,
						panes: [
							{
								id: paneId,
								kind: row.kind,
								titleOverride: row.descriptor.titleOverride,
								data,
							},
						],
					});
				}
				if (row.kind !== "terminal")
					await acknowledge.mutateAsync({ workspaceId, id });
				await utils.paneRecovery.list.invalidate({ workspaceId });
				await utils.terminal.list.invalidate({ workspaceId });
			} catch (error) {
				toast.error(errorMessage(error));
			} finally {
				restoring.current = false;
			}
		},
		[workspaceId, store, restoreMutation, acknowledge, utils],
	);
	const prepare = useCallback(
		async (panes: readonly Pane<PaneViewerData>[]) => {
			const closingIds = new Set(panes.map((p) => p.id));
			const buffers = new Map(
				await Promise.all(
					panes
						.filter((pane) => pane.kind === "terminal")
						.map(
							async (pane) =>
								[
									pane.id,
									await terminalRuntimeRegistry.captureRecoveryBuffer(
										(pane.data as TerminalPaneData).terminalId,
										pane.id,
									),
								] as const,
						),
				),
			);
			const entries = panes.flatMap((pane) => {
				let descriptor:
					| {
							kind: "terminal";
							terminalId: string;
							terminate: boolean;
							snapshot?: TerminalRecoverySnapshot;
					  }
					| { kind: "file"; filePath: string }
					| { kind: "browser"; url: string };
				if (pane.kind === "terminal") {
					const { terminalId } = pane.data as TerminalPaneData;
					const other = store
						.getState()
						.tabs.some((tab) =>
							Object.values(tab.panes).some(
								(p) =>
									p.kind === "terminal" &&
									!closingIds.has(p.id) &&
									(p.data as TerminalPaneData).terminalId === terminalId,
							),
						);
					descriptor = {
						kind: "terminal",
						terminalId,
						terminate: !other,
						snapshot: buffers.get(pane.id),
					};
				} else if (pane.kind === "file")
					descriptor = {
						kind: "file",
						filePath: (pane.data as FilePaneData).filePath,
					};
				else if (pane.kind === "browser")
					descriptor = {
						kind: "browser",
						url: (pane.data as BrowserPaneData).url,
					};
				else return [];
				const id = prepared.current.get(pane.id) ?? crypto.randomUUID();
				prepared.current.set(pane.id, id);
				return [
					{
						id,
						paneId: pane.id,
						titleOverride: pane.titleOverride?.slice(0, 256),
						title: (
							pane.titleOverride ??
							(pane.kind === "terminal"
								? terminalRuntimeRegistry.getTitle(
										(pane.data as TerminalPaneData).terminalId,
										pane.id,
									)
								: undefined) ??
							(descriptor.kind === "file"
								? (descriptor.filePath.split("/").pop() ?? "")
								: descriptor.kind === "browser"
									? descriptor.url
									: "")
						).slice(0, 256),
						pane: descriptor,
					},
				];
			});
			if (!entries.length) return true;
			try {
				await close.mutateAsync({ workspaceId, entries });
				for (const item of entries) {
					committed.current.add(item.paneId);
				}
				void utils.terminal.list.invalidate({ workspaceId });
				return true;
			} catch (error) {
				toast.error(errorMessage(error));
				return false;
			}
		},
		[store, workspaceId, close, utils],
	);
	const afterClose = useCallback(
		(pane: Pane<PaneViewerData>) => {
			const id = prepared.current.get(pane.id);
			if (!id || !committed.current.delete(pane.id)) return false;
			prepared.current.delete(pane.id);
			void utils.paneRecovery.list.invalidate({ workspaceId });

			return true;
		},
		[workspaceId, utils],
	);
	const wrapRegistry = useCallback(
		(registry: PaneRegistry<PaneViewerData>): PaneRegistry<PaneViewerData> =>
			Object.fromEntries(
				Object.entries(registry).map(([kind, definition]) => [
					kind,
					{
						...definition,
						onBeforeClose: async (pane: Pane<PaneViewerData>) => {
							if (
								definition.onBeforeClose &&
								!(await definition.onBeforeClose(pane))
							)
								return false;
							return prepare([pane]);
						},
						onAfterClose: (
							pane: Pane<PaneViewerData>,
							panes: readonly Pane<PaneViewerData>[],
						) => {
							afterClose(pane);
							definition.onAfterClose?.(pane, panes);
						},
					},
				]),
			),
		[prepare, afterClose],
	);
	const removeSession = useCallback(
		async (terminalId: string) => {
			const locations = store.getState().tabs.flatMap((tab) =>
				Object.values(tab.panes)
					.filter(
						(p) =>
							p.kind === "terminal" &&
							(p.data as TerminalPaneData).terminalId === terminalId,
					)
					.map((pane) => ({ tabId: tab.id, pane })),
			);
			const panes = locations.length
				? locations.map((l) => l.pane)
				: [
						{
							id: `terminal-${terminalId}`,
							kind: "terminal",
							data: { terminalId },
						},
					];
			if (!(await prepare(panes))) return;
			for (const location of locations)
				store
					.getState()
					.closePane({ tabId: location.tabId, paneId: location.pane.id });
			if (!locations.length) afterClose(panes[0]);
		},
		[store, prepare, afterClose],
	);
	return useMemo(
		() => ({
			prepare,
			wrapRegistry,
			removeSession,
			restore,
			history: history.data ?? [],
			isLoading: history.isLoading,
			isRestoring: restoreMutation.isPending,
		}),
		[
			prepare,
			wrapRegistry,
			removeSession,
			restore,
			history.data,
			history.isLoading,
			restoreMutation.isPending,
		],
	);
}
