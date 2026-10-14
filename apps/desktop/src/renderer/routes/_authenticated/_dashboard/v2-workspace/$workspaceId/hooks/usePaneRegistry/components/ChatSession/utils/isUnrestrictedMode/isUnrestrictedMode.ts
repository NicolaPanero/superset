import { isFullAccessMode } from "@superset/chat/protocol";

export function isUnrestrictedMode(modeId: string | undefined): boolean {
	return isFullAccessMode(modeId);
}
