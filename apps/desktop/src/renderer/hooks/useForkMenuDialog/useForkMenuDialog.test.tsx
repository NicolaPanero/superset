import { expect, test } from "bun:test";
import { act, renderHook } from "renderer/test-utils/fork-ui";
import { useForkMenuDialog } from "./useForkMenuDialog";

test("a dialog action waits until the originating menu has closed", () => {
	const calls: string[] = [];
	const { result } = renderHook(useForkMenuDialog);
	act(() => result.current.afterClose(() => calls.push("open dialog")));
	expect(calls).toEqual([]);
	const event = new Event("closeAutoFocus", { cancelable: true });
	act(() => result.current.onCloseAutoFocus(event));
	expect(event.defaultPrevented).toBe(true);
	expect(calls).toEqual(["open dialog"]);
});
test("ordinary Escape closing restores focus without reopening a dialog", () => {
	const { result } = renderHook(useForkMenuDialog);
	const event = new Event("closeAutoFocus", { cancelable: true });
	act(() => result.current.onCloseAutoFocus(event));
	expect(event.defaultPrevented).toBe(false);
});
test("pending dialog actions survive rerender and run exactly once", () => {
	let calls = 0;
	const { result, rerender } = renderHook(useForkMenuDialog);
	act(() => result.current.afterClose(() => calls++));
	rerender();
	act(() =>
		result.current.onCloseAutoFocus(
			new Event("closeAutoFocus", { cancelable: true }),
		),
	);
	const ordinary = new Event("closeAutoFocus", { cancelable: true });
	act(() => result.current.onCloseAutoFocus(ordinary));
	expect(calls).toBe(1);
	expect(ordinary.defaultPrevented).toBe(false);
});
test("the last menu selection wins and prevents a focus race before opening", () => {
	const calls: string[] = [];
	const { result } = renderHook(useForkMenuDialog);
	act(() => {
		result.current.afterClose(() => calls.push("rename"));
		result.current.afterClose(() => calls.push("sign in"));
	});
	const event = new Event("closeAutoFocus", { cancelable: true });
	act(() => result.current.onCloseAutoFocus(event));
	expect(calls).toEqual(["sign in"]);
});
