import { expect, mock, test } from "bun:test";
import { act, fireEvent, render } from "renderer/test-utils/fork-ui";
import { ForkUpdateToast } from "./ForkUpdateToast";

const tag = "desktop-v1.37.0-fork.aaaaaaa";
test("Later and the accessible close button defer without starting installation", () => {
	const install = mock(async () => true),
		later = mock(() => {});
	const view = render(
		<ForkUpdateToast tag={tag} onInstall={install} onLater={later} />,
	);
	fireEvent.click(view.getByRole("button", { name: "Later" }));
	fireEvent.click(view.getByRole("button", { name: "Dismiss" }));
	expect(later).toHaveBeenCalledTimes(2);
	expect(install).not.toHaveBeenCalled();
});
test("installation disables repeated clicks and re-enables retry after cancellation", async () => {
	let finish: ((ok: boolean) => void) | undefined;
	const install = mock(
		() =>
			new Promise<boolean>((resolve) => {
				finish = resolve;
			}),
	);
	const view = render(
		<ForkUpdateToast tag={tag} onInstall={install} onLater={() => {}} />,
	);
	const button = view.getByRole("button", { name: "Install and restart" });
	fireEvent.click(button);
	fireEvent.click(button);
	expect(button.hasAttribute("disabled")).toBe(true);
	expect(
		view.getByRole("button", { name: "Later" }).hasAttribute("disabled"),
	).toBe(true);
	expect(install).toHaveBeenCalledTimes(1);
	await act(async () => {
		finish?.(false);
		await Promise.resolve();
	});
	expect(button.hasAttribute("disabled")).toBe(false);
	expect(view.getByText("1.37.0-fork.aaaaaaa")).toBeTruthy();
});
