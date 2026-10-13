import { useCallback } from "react";
import {
	useForkCliOptions,
	useForkCliOptionsStore,
} from "renderer/stores/fork-cli-options";
import { useSettings } from "renderer/stores/settings";

export type AcpChatAvailability = "enabled" | "disabled" | "resolving";

export function useAcpChatEnabled(): AcpChatAvailability {
	const advanced = useForkCliOptions();
	const enabled = useSettings((state) => state.acpChatEnabled !== false);
	return !advanced || enabled ? "enabled" : "disabled";
}

export function useAwaitAcpChatEnabled(): () => Promise<boolean> {
	return useCallback(
		() =>
			Promise.resolve(
				!useForkCliOptionsStore.getState().showCliOptions ||
					useSettings.getState().acpChatEnabled !== false,
			),
		[],
	);
}
