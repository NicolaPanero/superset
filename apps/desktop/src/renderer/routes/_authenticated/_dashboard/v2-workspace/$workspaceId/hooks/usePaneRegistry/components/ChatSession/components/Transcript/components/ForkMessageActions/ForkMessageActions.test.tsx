import { afterEach, expect, spyOn, test } from "bun:test";
import type { UserMessage } from "@superset/chat/protocol";

const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);
const { ForkMessageActions } = await import("./ForkMessageActions");

afterEach(async () => {
	await act(async () => cleanup());
});
const item: UserMessage = {
	id: "user-2",
	kind: "user_message",
	startedAtMs: 1736935200000,
	completedAtMs: 1736935205000,
	content: [{ type: "text", text: "My prompt" }],
};

test("user actions copy the message and show its sent time", async () => {
	const clipboard = spyOn(navigator.clipboard, "writeText").mockResolvedValue(
		undefined,
	);
	try {
		const view = render(<ForkMessageActions item={item} text="My prompt" />);
		await act(async () => {
			fireEvent.click(view.getByRole("button", { name: "Copy message" }));
		});
		expect(clipboard).toHaveBeenCalledWith("My prompt");
		expect(view.container.querySelector("time")?.dateTime).toBe(
			new Date(item.startedAtMs).toISOString(),
		);
		expect(view.queryByRole("button", { name: "Rewind from here" })).toBeNull();
	} finally {
		clipboard.mockRestore();
	}
});

test("the fork menu passes the selected user id and rewind stays a separate action", async () => {
	const forks: unknown[] = [];
	let rewinds = 0;
	const view = render(
		<ForkMessageActions
			forkFromHere
			item={item}
			text="My prompt"
			onFork={(target, id) => forks.push([target, id])}
			onRewind={() => rewinds++}
		/>,
	);
	await act(async () => {
		fireEvent.click(view.getByRole("button", { name: "Rewind from here" }));
	});
	expect(rewinds).toBe(1);
	await act(async () => {
		fireEvent.keyDown(view.getByRole("button", { name: "Fork from here" }), {
			key: "Enter",
		});
	});
	await act(async () => {
		fireEvent.click(
			view.getByRole("menuitem", { name: /Branch in this workspace/ }),
		);
	});
	expect(forks).toEqual([["workspace", "user-2"]]);
});
