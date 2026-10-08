import type { Pane, WorkspaceStore } from "@superset/panes";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useMemo } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, TerminalPaneData } from "../../types";
import { findTerminalPaneLocation } from "../../utils/focusTerminalPane";
import { useChatWiring } from "../usePaneRegistry/components/ChatSession/hooks/useSessionClient";

export interface BackgroundChat {
	terminalId: string;
	title: string;
	parkedAt: number;
	paneData: TerminalPaneData;
}

/**
 * A closed ACP chat pane keeps its agent running, as a closed terminal keeps
 * its process: the host remembers the pane so a click reopens it as a chat.
 */
export function useForkBackgroundChats(workspaceId: string) {
	const wiring = useChatWiring();
	const utils = workspaceTrpc.useUtils();
	const { data, isSuccess: loaded } = workspaceTrpc.agents.parkedChats.useQuery(
		{ workspaceId },
		{ refetchOnWindowFocus: false },
	);
	const { mutateAsync: parkAsync } =
		workspaceTrpc.agents.parkChat.useMutation();
	const { mutateAsync: unparkAsync } =
		workspaceTrpc.agents.unparkChat.useMutation();

	const chats = useMemo(
		() => (data ?? []) as unknown as BackgroundChat[],
		[data],
	);
	const refresh = useCallback(
		() => utils.agents.parkedChats.invalidate({ workspaceId }),
		[utils, workspaceId],
	);
	const closeChat = useCallback(
		(paneData: Partial<TerminalPaneData>) =>
			paneData.acpSessionId
				? wiring.transport
						.closeSession({ sessionId: paneData.acpSessionId })
						.catch(() => undefined)
				: Promise.resolve(),
		[wiring.transport],
	);

	const park = useCallback(
		async (pane: Pane<PaneViewerData>) => {
			const {
				pendingPrompt: _prompt,
				pendingAttachments: _attachments,
				...paneData
			} = pane.data as TerminalPaneData;
			if (!paneData.acpSessionId && !paneData.agent?.sessionId) return;
			try {
				const { evicted } = await parkAsync({
					workspaceId,
					terminalId: paneData.terminalId,
					title:
						pane.titleOverride ??
						paneData.chatTitle ??
						paneData.agent?.id ??
						"",
					paneData,
				});
				await Promise.all(evicted.map(closeChat));
				void refresh();
			} catch (error) {
				console.warn("[acp-chat] could not keep the chat in background", error);
				await closeChat(paneData);
			}
		},
		[parkAsync, workspaceId, closeChat, refresh],
	);

	const reopen = useCallback(
		(store: StoreApi<WorkspaceStore<PaneViewerData>>, chat: BackgroundChat) => {
			store.getState().addTab({
				panes: [
					{
						kind: "terminal",
						...(chat.title ? { titleOverride: chat.title } : {}),
						data: chat.paneData,
					},
				],
			});
			void unparkAsync({ terminalId: chat.terminalId }).then(refresh);
		},
		[unparkAsync, refresh],
	);

	/** Reopens a background chat that has no pane; false when there is none. */
	const reopenParked = useCallback(
		(store: StoreApi<WorkspaceStore<PaneViewerData>>, terminalId: string) => {
			const chat = chats.find((parked) => parked.terminalId === terminalId);
			if (!chat || findTerminalPaneLocation(store.getState(), terminalId))
				return false;
			reopen(store, chat);
			return true;
		},
		[chats, reopen],
	);

	const stop = useCallback(
		async (chat: BackgroundChat) => {
			await closeChat(chat.paneData);
			await unparkAsync({ terminalId: chat.terminalId });
			void refresh();
		},
		[closeChat, unparkAsync, refresh],
	);

	return { chats, loaded, park, reopen, reopenParked, stop };
}
