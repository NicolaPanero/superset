import { agentStatusFromEvent } from "@superset/shared/agent-status";

export const FORK_KEEP_AWAKE_MODES = ["off", "agents", "always"] as const;
export type ForkKeepAwakeMode = (typeof FORK_KEEP_AWAKE_MODES)[number];
export const FORK_KEEP_AWAKE_DEFAULT_MODE: ForkKeepAwakeMode = "agents";

// A turn that stops without a Stop hook (crash, killed CLI) must not hold the Mac awake forever.
export const FORK_KEEP_AWAKE_STALE_TURN_MS = 3 * 60 * 60_000;

export interface ForkKeepAwakeBinding {
	lastEventType: string;
	lastEventAt: number;
}

export function parseForkKeepAwakeMode(raw: string | null): ForkKeepAwakeMode {
	if (!raw) return FORK_KEEP_AWAKE_DEFAULT_MODE;
	try {
		const mode = (JSON.parse(raw) as { mode?: unknown }).mode;
		return (
			FORK_KEEP_AWAKE_MODES.find((known) => known === mode) ??
			FORK_KEEP_AWAKE_DEFAULT_MODE
		);
	} catch {
		return FORK_KEEP_AWAKE_DEFAULT_MODE;
	}
}

export function isAnyAgentWorking(
	bindings: readonly ForkKeepAwakeBinding[],
	now: number,
): boolean {
	return bindings.some(
		(binding) =>
			agentStatusFromEvent(binding.lastEventType) === "working" &&
			now - binding.lastEventAt < FORK_KEEP_AWAKE_STALE_TURN_MS,
	);
}

export function shouldKeepAwake(
	mode: ForkKeepAwakeMode,
	agentsWorking: boolean,
): boolean {
	if (mode === "always") return true;
	if (mode === "agents") return agentsWorking;
	return false;
}
