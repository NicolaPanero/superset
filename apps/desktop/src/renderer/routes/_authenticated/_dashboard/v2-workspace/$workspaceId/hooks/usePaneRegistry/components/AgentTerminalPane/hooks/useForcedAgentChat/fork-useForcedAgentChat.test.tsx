import { expect, test } from "bun:test";
import { act, flush, renderHook } from "renderer/test-utils/fork-ui";
import { useForcedAgentChat } from "./useForcedAgentChat";

test("restored CLI converts once; rerenders do not start another agent", async () => {
	let calls = 0;
	let finish!: (value: boolean) => void;
	const promise = new Promise<boolean>((resolve) => {
		finish = resolve;
	});
	const convert = () => {
		calls++;
		return promise;
	};
	const view = renderHook(
		({ key }) => useForcedAgentChat(key, false, convert),
		{ initialProps: { key: "native-session" } },
	);
	await flush();
	expect(calls).toBe(1);
	expect(view.result.current.state).toBe("opening");
	view.rerender({ key: "native-session" });
	await flush();
	expect(calls).toBe(1);
	await act(async () => finish(true));
	await flush();
	expect(calls).toBe(1);
});
test("a running response finishes before automatic conversion", async () => {
	let calls = 0;
	const view = renderHook(
		({ waiting }) =>
			useForcedAgentChat("history", waiting, async () => {
				calls++;
				return true;
			}),
		{ initialProps: { waiting: true } },
	);
	await flush();
	expect(calls).toBe(0);
	view.rerender({ waiting: false });
	await flush();
	expect(calls).toBe(1);
});
test("failed conversion waits for explicit retry instead of spawning or looping", async () => {
	let calls = 0;
	const convert = async () => {
		calls++;
		return false;
	};
	const view = renderHook(() => useForcedAgentChat("history", false, convert));
	await flush();
	expect(view.result.current.state).toBe("failed");
	expect(calls).toBe(1);
	view.rerender();
	await flush();
	expect(calls).toBe(1);
	act(() => view.result.current.retry());
	await flush();
	expect(calls).toBe(2);
});
test("advanced mode does not force a chat; disabling it does", async () => {
	let calls = 0;
	const view = renderHook(
		({ key }) =>
			useForcedAgentChat(key, false, async () => {
				calls++;
				return true;
			}),
		{ initialProps: { key: null as string | null } },
	);
	await flush();
	expect(calls).toBe(0);
	view.rerender({ key: "saved-cli" });
	await flush();
	expect(calls).toBe(1);
});

test("reopening a pane during migration shares the pending operation", async () => {
	let calls = 0;
	let finish!: (value: boolean) => void;
	const promise = new Promise<boolean>((resolve) => {
		finish = resolve;
	});
	const convert = () => {
		calls++;
		return promise;
	};
	const first = renderHook(() =>
		useForcedAgentChat("reopened-pane", false, convert),
	);
	await flush();
	first.unmount();
	renderHook(() => useForcedAgentChat("reopened-pane", false, convert));
	await flush();
	expect(calls).toBe(1);
	await act(async () => finish(true));
	await flush();
});
