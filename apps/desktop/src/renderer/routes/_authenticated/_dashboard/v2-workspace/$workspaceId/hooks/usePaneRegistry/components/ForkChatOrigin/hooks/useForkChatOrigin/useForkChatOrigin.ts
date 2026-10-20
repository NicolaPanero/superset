import type { RendererContext } from "@superset/panes";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback } from "react";
import type { PaneViewerData, TerminalPaneData } from "../../../../../../types";
import { markChatSessionClosed } from "../../../../../../utils/closedChatSessions";
import { useChatWiring } from "../../../ChatSession/hooks/useSessionClient";
import { forkChatContext } from "../../../ForkChatExtras/utils/forkChatContext/forkChatContext";
import {
	forgetPreviousChat,
	usePreviousChat,
} from "../../../ForkChatExtras/utils/previousChat";
import type { ForkChatOriginInfo } from "../../types";

/** The handoff a chat's session came from, and the way back after an in-place switch. */
export function useForkChatOrigin(
	ctx: RendererContext<PaneViewerData>,
	workspaceId: string,
): ForkChatOriginInfo | null {
	const fork = forkChatContext(ctx);
	const data = fork.pane.data as TerminalPaneData;
	const agent = data.agentSurface === "acp" ? data.agent : undefined;
	const { data: lineage } =
		workspaceTrpc.sessionTransfer.chatProvenance.useQuery(
			{
				workspaceId,
				agent: agent?.id ?? "",
				sessionId: agent?.sessionId ?? "",
			},
			{ enabled: Boolean(agent?.sessionId), staleTime: 60_000 },
		);
	const previous = usePreviousChat(data.terminalId);
	const wiring = useChatWiring();
	const onReturn = useCallback(() => {
		if (!previous) return;
		if (data.acpSessionId) {
			markChatSessionClosed(data.acpSessionId);
			void wiring.transport
				.closeSession({ sessionId: data.acpSessionId })
				.catch(() => undefined);
		}
		forgetPreviousChat(data.terminalId);
		fork.actions.updateData(previous.data);
		fork.actions.setTitle(previous.label);
	}, [previous, data, fork, wiring.transport]);
	const source = lineage && agent?.sessionId ? lineage : null;
	if (previous)
		return {
			label: source?.label ?? previous.label,
			email: source?.email ?? null,
			summaryOnly: previous.summaryOnly,
			onReturn,
		};
	return source ? { label: source.label, email: source.email } : null;
}
