import type { SessionConfigOption } from "@superset/chat/protocol";

/**
 * An effort picked before a switch. The new session reports its options only
 * once it runs, so the composer applies it then and drops it.
 */
const pending = new Map<string, string>();

export function setPendingEffort(terminalId: string, effort: string): void {
	pending.set(terminalId, effort);
}

export function peekPendingEffort(terminalId: string): string | undefined {
	return pending.get(terminalId);
}

export function clearPendingEffort(terminalId: string): void {
	pending.delete(terminalId);
}

/** The effort option to set, or null when the session already has it or lacks it. */
export function pendingEffortChange(
	configOptions: SessionConfigOption[],
	effort: string,
): { configId: string; value: string } | null {
	const option = configOptions.find(
		(entry) => entry.category === "thought_level",
	);
	if (
		!option ||
		option.currentValue === effort ||
		!option.options.some((entry) => entry.id === effort)
	)
		return null;
	return { configId: option.id, value: effort };
}
