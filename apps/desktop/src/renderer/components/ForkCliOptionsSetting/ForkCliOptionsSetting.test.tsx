import { afterEach, expect, test } from "bun:test";
import { ForkExternalAccount } from "renderer/components/ForkExternalAccount";
import {
	useAcpChatEnabled,
	useAwaitAcpChatEnabled,
} from "renderer/hooks/useAcpChatEnabled";
import { useForkCliOptionsStore } from "renderer/stores/fork-cli-options";
import { useSettings } from "renderer/stores/settings";
import {
	act,
	fireEvent,
	render,
	renderHook,
} from "renderer/test-utils/fork-ui";
import { ForkCliOptionsSetting } from "./ForkCliOptionsSetting";

afterEach(() => {
	useForkCliOptionsStore.getState().setShowCliOptions(false);
	useSettings.getState().update("acpChatEnabled", true);
});
test("the accessible local toggle reveals CLI login and hides it again without removing profiles", () => {
	const view = render(
		<>
			<ForkCliOptionsSetting />
			<ForkExternalAccount external>
				<p>External profile</p>
			</ForkExternalAccount>
			<ForkExternalAccount external={false}>
				<p>Managed profile</p>
			</ForkExternalAccount>
		</>,
	);
	expect(view.queryByText("External profile")).toBeNull();
	expect(view.getByText("Managed profile")).toBeTruthy();
	const toggle = view.getByRole("switch", { name: "Advanced CLI options" });
	expect(toggle.getAttribute("aria-describedby")).toBe(
		"fork-cli-options-description",
	);
	fireEvent.click(toggle);
	expect(toggle.getAttribute("aria-checked")).toBe("true");
	expect(view.getByText("External profile")).toBeTruthy();
	fireEvent.click(toggle);
	expect(view.queryByText("External profile")).toBeNull();
	expect(view.getByText("Managed profile")).toBeTruthy();
});
test("basic mode always opens chats; advanced mode restores the saved ACP preference", async () => {
	useSettings.getState().update("acpChatEnabled", false);
	const hook = renderHook(() => ({
		availability: useAcpChatEnabled(),
		awaitEnabled: useAwaitAcpChatEnabled(),
	}));
	expect(hook.result.current.availability).toBe("enabled");
	expect(await hook.result.current.awaitEnabled()).toBe(true);
	act(() => useForkCliOptionsStore.getState().setShowCliOptions(true));
	expect(hook.result.current.availability).toBe("disabled");
	expect(await hook.result.current.awaitEnabled()).toBe(false);
	act(() => useForkCliOptionsStore.getState().setShowCliOptions(false));
	expect(hook.result.current.availability).toBe("enabled");
	expect(useSettings.getState().acpChatEnabled).toBe(false);
});
