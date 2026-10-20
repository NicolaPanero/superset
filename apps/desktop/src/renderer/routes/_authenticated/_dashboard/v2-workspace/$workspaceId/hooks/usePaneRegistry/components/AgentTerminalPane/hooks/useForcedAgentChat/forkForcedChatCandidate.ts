import { acpHarnessForPreset } from "@superset/chat/core";
import { agentStatusFromEvent } from "@superset/shared/agent-status";
import type { AgentIdentity } from "../useAgentSurfaceSwitch";

export function forkForcedChatCandidate(options: {
	advanced: boolean;
	data: { agentSurface?: "cli" | "acp"; agent?: AgentIdentity };
	binding?: {
		agentId: string;
		agentSessionId?: string;
		terminalId: string;
		lastEventType: string;
		endedAt?: number;
	};
}): { agent: AgentIdentity; waiting: boolean } | null {
	if (options.advanced || options.data.agentSurface === "acp") return null;
	const binding = options.binding;
	const agent =
		binding &&
		!binding.endedAt &&
		binding.agentSessionId &&
		acpHarnessForPreset(binding.agentId)
			? {
					id: binding.agentId,
					sessionId: binding.agentSessionId,
					terminalId: binding.terminalId,
				}
			: options.data.agent;
	if (!agent || !agent.sessionId || !acpHarnessForPreset(agent.id)) return null;
	const status =
		binding && !binding.endedAt
			? agentStatusFromEvent(binding.lastEventType)
			: null;
	return { agent, waiting: status === "working" || status === "permission" };
}
