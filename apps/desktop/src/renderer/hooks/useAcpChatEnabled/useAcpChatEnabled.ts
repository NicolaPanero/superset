import { useCallback } from "react";
import { useSettings } from "renderer/stores/settings";

export type AcpChatAvailability = "enabled" | "disabled" | "resolving";

export function useAcpChatEnabled(): AcpChatAvailability {
	return useSettings((state) => state.acpChatEnabled !== false)
		? "enabled"
		: "disabled";
}

export function useAwaitAcpChatEnabled(): () => Promise<boolean> {
	return useCallback(
		() => Promise.resolve(useSettings.getState().acpChatEnabled !== false),
		[],
	);
}
