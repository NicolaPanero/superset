export type ForkTransferMode = "native" | "context";

export function forkTransferPolicy(
	mode: ForkTransferMode,
	nativeAvailable: boolean,
) {
	return { mode, allowed: mode === "context" || nativeAvailable };
}

export function runForkTransfer(
	policy: ReturnType<typeof forkTransferPolicy>,
	actions: Record<ForkTransferMode, () => Promise<void>>,
) {
	if (!policy.allowed) return;
	return actions[policy.mode]();
}
