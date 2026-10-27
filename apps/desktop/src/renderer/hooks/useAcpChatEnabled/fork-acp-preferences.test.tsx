import { afterEach, expect, test } from "bun:test";
import { useAcpChatStore } from "renderer/stores/acp-chat";
import { useForkCliOptionsStore } from "renderer/stores/fork-cli-options";
import { useSettings } from "renderer/stores/settings";
import { act, renderHook } from "renderer/test-utils/fork-ui";
import { useAcpChatEnabled, useAwaitAcpChatEnabled } from "./useAcpChatEnabled";

const initial = {
	chosen: useAcpChatStore.getState().enabled,
	advanced: useForkCliOptionsStore.getState().showCliOptions,
	legacy: useSettings.getState().acpChatEnabled,
};

afterEach(() => {
	useAcpChatStore.setState({ enabled: initial.chosen });
	useForkCliOptionsStore.getState().setShowCliOptions(initial.advanced);
	useSettings.getState().update("acpChatEnabled", initial.legacy);
});

test("advanced mode preserves the legacy ACP choice until the new preference is set", async () => {
	useForkCliOptionsStore.getState().setShowCliOptions(true);
	useSettings.getState().update("acpChatEnabled", false);
	useAcpChatStore.setState({ enabled: null });
	const hook = renderHook(() => ({
		availability: useAcpChatEnabled(),
		awaitEnabled: useAwaitAcpChatEnabled(),
	}));
	expect(hook.result.current.availability).toBe("disabled");
	expect(await hook.result.current.awaitEnabled()).toBe(false);
	act(() => useAcpChatStore.getState().setEnabled(true));
	expect(hook.result.current.availability).toBe("enabled");
	expect(await hook.result.current.awaitEnabled()).toBe(true);
	expect(useSettings.getState().acpChatEnabled).toBe(false);
});

test("basic mode enables ACP while retaining the advanced preference", async () => {
	useForkCliOptionsStore.getState().setShowCliOptions(false);
	useSettings.getState().update("acpChatEnabled", true);
	useAcpChatStore.getState().setEnabled(false);
	const hook = renderHook(() => ({
		availability: useAcpChatEnabled(),
		awaitEnabled: useAwaitAcpChatEnabled(),
	}));
	expect(hook.result.current.availability).toBe("enabled");
	expect(await hook.result.current.awaitEnabled()).toBe(true);
	act(() => useForkCliOptionsStore.getState().setShowCliOptions(true));
	expect(hook.result.current.availability).toBe("disabled");
	expect(await hook.result.current.awaitEnabled()).toBe(false);
	expect(useAcpChatStore.getState().enabled).toBe(false);
});
