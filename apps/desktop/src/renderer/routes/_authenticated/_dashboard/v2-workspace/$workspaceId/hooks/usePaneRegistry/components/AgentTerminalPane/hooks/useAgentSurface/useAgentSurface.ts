import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useAcpChatEnabled } from "renderer/hooks/useAcpChatEnabled";
import { acpHarnessForPreset } from "renderer/lib/acpHarness";
import type { TerminalPaneData } from "../../../../../../types";
import type { AgentIdentity, AgentSurface } from "../useAgentSurfaceSwitch";

export type ResolvedAgentSurface = {
	surface: AgentSurface;
	/** Present only when this agent can be opened as a chat at all. */
	agent: AgentIdentity | undefined;
	/** Whether the surface can be switched, for the toggle's visibility. */
	switchable: boolean;
};

export function useAgentSurface(
	workspaceId: string,
	data: TerminalPaneData,
): ResolvedAgentSurface {
	const acpChat = useAcpChatEnabled();
	const binding = useTerminalAgentBinding(workspaceId, data.terminalId);
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
	const surface: AgentSurface = data.agentSurface ?? "cli";

	return { surface, agent, switchable: chatCapable };
}
