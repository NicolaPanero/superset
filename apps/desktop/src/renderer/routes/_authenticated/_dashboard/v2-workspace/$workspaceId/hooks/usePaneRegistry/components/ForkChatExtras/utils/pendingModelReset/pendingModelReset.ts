import type { SessionConfigOption } from "@superset/chat/protocol";

const DEFAULT_MODEL_ID = "default";

/**
 * A chat switched without a picked model. A resumed transcript can carry the
 * source agent's model, which the new agent cannot select.
 */
const pending = new Set<string>();

export function setPendingModelReset(terminalId: string): void {
	pending.add(terminalId);
}

export function hasPendingModelReset(terminalId: string): boolean {
	return pending.has(terminalId);
}

export function clearPendingModelReset(terminalId: string): void {
	pending.delete(terminalId);
}

/** The default model to set when the session reports a model it cannot select. */
export function pendingModelResetChange(
	configOptions: SessionConfigOption[],
): { configId: string; value: string } | null {
	const option = configOptions.find(
		(entry) => entry.category === "model" && entry.options.length > 0,
	);
	if (
		!option ||
		option.options.some((entry) => entry.id === option.currentValue)
	)
		return null;
	const fallback =
		option.options.find((entry) => entry.id === DEFAULT_MODEL_ID) ??
		option.options[0];
	return fallback ? { configId: option.id, value: fallback.id } : null;
}
