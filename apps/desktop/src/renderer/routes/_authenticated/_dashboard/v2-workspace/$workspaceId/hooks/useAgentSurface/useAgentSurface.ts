import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import type { TerminalPaneData } from "../../types";
import { acpHarnessForAgent } from "../../utils/acpHarness";
import { useAcpChatEnabled } from "../useAcpChatEnabled";
import type { AgentIdentity, AgentSurface } from "../useAgentSurfaceSwitch";

export type ResolvedAgentSurface = {
	surface: AgentSurface;
	/** Present only when this agent can be opened as a chat at all. */
	agent: AgentIdentity | undefined;
	/** Whether the surface can be switched, for the toggle's visibility. */
	switchable: boolean;
};

/**
 * Which surface an agent terminal shows.
 *
 * Derived rather than stamped at creation: a terminal becomes an agent
 * terminal when the agent reports its binding, and several paths create one
 * (the launcher, presets, hotkeys, the session dropdown). Deciding here means
 * every one of them opens on the chat, and a pane the user has toggled keeps
 * the choice they made.
 */
export function useAgentSurface(
	workspaceId: string,
	data: TerminalPaneData,
): ResolvedAgentSurface {
	const acpEnabled = useAcpChatEnabled();
	const binding = useTerminalAgentBinding(workspaceId, data.terminalId);
	const harness = acpHarnessForAgent(binding?.agentId);

	const agent =
		harness && binding?.agentId && binding.agentSessionId && !binding.endedAt
			? { id: binding.agentId, sessionId: binding.agentSessionId }
			: undefined;

	// The pane remembers an agent it has already opened as a chat, so the
	// surface survives the binding going away with the pty.
	const chatCapable = Boolean(acpEnabled && (agent || data.agent));
	const surface: AgentSurface =
		data.agentSurface ?? (chatCapable ? "acp" : "cli");

	return { surface, agent, switchable: chatCapable };
}
