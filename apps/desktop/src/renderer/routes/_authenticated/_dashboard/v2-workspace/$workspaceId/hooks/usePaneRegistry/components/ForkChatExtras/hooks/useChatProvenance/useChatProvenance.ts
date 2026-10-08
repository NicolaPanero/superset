import { workspaceTrpc } from "@superset/workspace-client";
import type { TerminalPaneData } from "../../../../../../types";
import type { ForkChatProvenance } from "../../../ChatSession/providers/ForkChatProvenanceProvider";

/** The handoff a chat's session came from, for the notice atop the chat. */
export function useChatProvenance(
	workspaceId: string,
	data: TerminalPaneData,
): ForkChatProvenance | null {
	const agent = data.agentSurface === "acp" ? data.agent : undefined;
	const { data: provenance } =
		workspaceTrpc.sessionTransfer.chatProvenance.useQuery(
			{
				workspaceId,
				agent: agent?.id ?? "",
				sessionId: agent?.sessionId ?? "",
			},
			{ enabled: Boolean(agent?.sessionId), staleTime: 60_000 },
		);
	return provenance && agent?.sessionId
		? { label: provenance.label, email: provenance.email }
		: null;
}
