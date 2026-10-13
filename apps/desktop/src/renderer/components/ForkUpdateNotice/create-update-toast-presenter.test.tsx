import { expect, mock, test } from "bun:test";
import { Toaster, toast } from "@superset/ui/sonner";
import { act, fireEvent, render } from "renderer/test-utils/fork-ui";
import { createUpdateToastPresenter } from "./create-update-toast-presenter";

test("a new release remains visible when it arrives immediately after Later", async () => {
	const originalFrame = globalThis.requestAnimationFrame;
	const frames: FrameRequestCallback[] = [];
	const originalTimeout = globalThis.setTimeout;
	const pending: (() => void)[] = [];
	globalThis.setTimeout = ((
		callback: (...args: unknown[]) => void,
		delay?: number,
		...args: unknown[]
	) => {
		if (delay) return originalTimeout(callback, delay, ...args);
		pending.push(() => callback(...args));
		return (10_000 + pending.length) as unknown as ReturnType<
			typeof setTimeout
		>;
	}) as typeof setTimeout;
	const flushQueues = () =>
		act(async () => {
			for (let i = 0; i < 10 && (pending.length || frames.length); i++) {
				for (const callback of pending.splice(0)) callback();
				for (const callback of frames.splice(0)) callback(performance.now());
				await Promise.resolve();
			}
		});
	globalThis.requestAnimationFrame = (callback) => {
		frames.push(callback);
		return frames.length;
	};
	const later = mock((_tag: string) => {
		presenter.update(null);
	});
	const presenter = createUpdateToastPresenter({
		focused: () => true,
		install: async () => false,
		later,
	});
	try {
		const view = render(
			<>
				<textarea aria-label="Chat" />
				<Toaster theme="dark" />
			</>,
		);
		const composer = view.getByLabelText("Chat");
		act(() => composer.focus());
		act(() =>
			presenter.update({
				tag: "desktop-v1.37.0-fork.aaaaaaa",
				installed: "old",
			}),
		);
		await flushQueues();
		expect(document.activeElement).toBe(composer);
		fireEvent.click(view.getByRole("button", { name: "Later" }));
		act(() =>
			presenter.update({
				tag: "desktop-v1.37.0-fork.bbbbbbb",
				installed: "old",
			}),
		);
		await flushQueues();
		const next = view
			.getByText("1.37.0-fork.bbbbbbb")
			.closest("[data-sonner-toast]");
		expect(next).not.toBeNull();
		expect(next?.getAttribute("data-removed")).not.toBe("true");
		expect(later).toHaveBeenCalledWith("desktop-v1.37.0-fork.aaaaaaa");
	} finally {
		act(() => {
			presenter.dispose();
			toast.dismiss();
		});
		globalThis.setTimeout = originalTimeout;
		globalThis.requestAnimationFrame = originalFrame;
	}
});
