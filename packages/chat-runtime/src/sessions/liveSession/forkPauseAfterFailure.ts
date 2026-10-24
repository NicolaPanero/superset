import type { Turn } from "@superset/chat/protocol";

export function forkPauseAfterFailure(turn: Turn): boolean {
	return (
		turn.status === "failed" &&
		/\[(unavailable|resource_exhausted)\]/i.test(turn.error?.message ?? "")
	);
}
