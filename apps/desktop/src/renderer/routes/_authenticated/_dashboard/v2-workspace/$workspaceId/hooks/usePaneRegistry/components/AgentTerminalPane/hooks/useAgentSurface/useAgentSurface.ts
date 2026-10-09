import { acpHarnessForPreset } from "@superset/chat/core";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useAcpChatEnabled } from "renderer/hooks/useAcpChatEnabled";
import type { ChatPaneData, TerminalPaneData } from "../../../../../../types";
import type { AgentIdentity, AgentSurface } from "../useAgentSurfaceSwitch";

export type AgentPane =
	| { kind: "terminal"; data: TerminalPaneData }
	| { kind: "chat"; data: ChatPaneData };

export type ResolvedAgentSurface = {
	surface: AgentSurface;
	agent: AgentIdentity | undefined;
	switchable: boolean;
};

export function useAgentSurface(
	workspaceId: string,
	pane: AgentPane,
): ResolvedAgentSurface {
	const acpChat = useAcpChatEnabled();
	const binding = useTerminalAgentBinding(workspaceId, pane.data.terminalId);

	if (pane.kind === "chat") {
		return {
			surface: "acp",
			agent: pane.data.agent,
			switchable: Boolean(pane.data.agent),
		};
	}

	const data = pane.data;
	const harness = acpHarnessForPreset(binding?.agentId);
	const agent =
		harness && binding?.agentId && binding.agentSessionId && !binding.endedAt
			? {
					id: binding.agentId,
					sessionId: binding.agentSessionId,
					terminalId: data.terminalId,
				}
			: data.agent
				? { id: data.agent.id, sessionId: data.agent.sessionId }
				: undefined;

	// The pane remembers an agent it has already opened as a chat, so the
	// surface survives the binding going away with the pty.
	const chatCapable = Boolean(
		(acpChat === "enabled" || data.agentSurface === "acp") &&
			(agent || data.agent),
	);
	const surface: AgentSurface = "cli";

	return { surface, agent, switchable: chatCapable };
}
