import { AGENT_DEFAULT_MODE, isFullAccessMode } from "@superset/chat/protocol";

const MODE_ORDER: Record<string, number> = {
	ask: 0,
	plan: 10,
	[AGENT_DEFAULT_MODE]: 20,
	default: 20,
	"read-only": 20,
	acceptEdits: 30,
	"workspace-write": 30,
	auto: 50,
	agent: 50,
};

export function forkModeOrder(modeId: string): number {
	return isFullAccessMode(modeId) ? 100 : (MODE_ORDER[modeId] ?? 40);
}
