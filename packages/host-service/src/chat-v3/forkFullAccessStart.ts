import { FULL_ACCESS_CHAT_MODE } from "@superset/chat/protocol";
import type { HarnessAdapter } from "@superset/chat-runtime";

/**
 * Every chat starts in full access unless a mode was picked, resumes and
 * handoffs included. An agent without a native full-access mode gets the
 * client-side one.
 */
export function startInFullAccess(
	adapter: HarnessAdapter,
	fullAccessModeId: string = FULL_ACCESS_CHAT_MODE,
): HarnessAdapter {
	const start = adapter.start;
	adapter.start = (options) =>
		start.call(
			adapter,
			options.modeId ? options : { ...options, modeId: fullAccessModeId },
		);
	return adapter;
}
