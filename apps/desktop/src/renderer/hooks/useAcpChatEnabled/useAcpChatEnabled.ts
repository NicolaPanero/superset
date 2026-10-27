import { useCallback } from "react";
import { useAcpChatStore } from "renderer/stores/acp-chat";
import {
	useForkCliOptions,
	useForkCliOptionsStore,
} from "renderer/stores/fork-cli-options";
import { useSettings } from "renderer/stores/settings";
import { forkAcpChatChoice } from "./fork-acp-chat-choice";

export type AcpChatAvailability = "enabled" | "disabled" | "resolving";

export function useAcpChatEnabled(): AcpChatAvailability {
	const advanced = useForkCliOptions();
	const chosen = useAcpChatStore((state) => state.enabled);
	const legacy = useSettings((state) => state.acpChatEnabled !== false);
	return forkAcpChatChoice({ advanced, chosen, legacy })
		? "enabled"
		: "disabled";
}

export function useAwaitAcpChatEnabled(): () => Promise<boolean> {
	return useCallback(
		() =>
			Promise.resolve(
				forkAcpChatChoice({
					advanced: useForkCliOptionsStore.getState().showCliOptions,
					chosen: useAcpChatStore.getState().enabled,
					legacy: useSettings.getState().acpChatEnabled !== false,
				}),
			),
		[],
	);
}
