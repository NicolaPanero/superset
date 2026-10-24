import { afterEach, expect, spyOn, test } from "bun:test";
import type { UserMessage } from "@superset/chat/protocol";

const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);
const { ForkMessageActionsProvider } = await import(
	"../../../../providers/ForkMessageActionsProvider"
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
		expect(
			view.queryByRole("button", { name: "Edit and restart from here" }),
		).toBeNull();
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
		fireEvent.click(
			view.getByRole("button", { name: "Edit and restart from here" }),
		);
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

test("unsupported agents explain restart limits and branch only the selected text", async () => {
	const branches: string[] = [];
	const view = render(
		<ForkMessageActionsProvider
			value={{
				nativeFork: false,
				busy: false,
				textBranch: (id) => branches.push(id),
			}}
		>
			<ForkMessageActions
				item={item}
				text="My prompt"
				onFork={() => {
					throw new Error("Must not fork the full session");
				}}
			/>
		</ForkMessageActionsProvider>,
	);
	const edit = view.getByRole("button", { name: "Edit and restart from here" });
	expect(edit.hasAttribute("disabled")).toBe(true);
	expect(edit.title).toBe(
		"This agent does not support returning to a specific message.",
	);
	await act(async () =>
		fireEvent.keyDown(
			view.getByRole("button", { name: "Branch this conversation" }),
			{ key: "Enter" },
		),
	);
	await act(async () =>
		fireEvent.click(
			view.getByRole("menuitem", { name: /New chat from loaded messages/ }),
		),
	);
	expect(branches).toEqual(["user-2"]);
});

test("a running agent keeps restart visible with the waiting reason", () => {
	const view = render(
		<ForkMessageActionsProvider value={{ nativeFork: true, busy: true }}>
			<ForkMessageActions item={item} text="My prompt" />
		</ForkMessageActionsProvider>,
	);
	const edit = view.getByRole("button", { name: "Edit and restart from here" });
	expect(edit.hasAttribute("disabled")).toBe(true);
	expect(edit.title).toBe("Wait for the agent and queued work to finish.");
});

test("opens an ordinary assistant plan in a side panel without provider-specific metadata", async () => {
	const view = render(
		<ForkMessageActions
			item={{
				id: "answer",
				kind: "agent_message",
				startedAtMs: 1,
				completedAtMs: 2,
				text: "# Implementation plan\n\nVerify the migration.",
			}}
			text="# Implementation plan\n\nVerify the migration."
		/>,
	);
	await act(async () =>
		fireEvent.click(
			view.getByRole("button", { name: "Open message in side panel" }),
		),
	);
	expect(view.getByRole("dialog").textContent).toContain(
		"Verify the migration.",
	);
});

test("a running native fork stays visible and explains the same wait as rollback", async () => {
	const view = render(
		<ForkMessageActionsProvider value={{ nativeFork: true, busy: true }}>
			<ForkMessageActions item={item} text="My prompt" />
		</ForkMessageActionsProvider>,
	);
	const fork = view.getByRole("button", { name: "Fork from here" });
	const rollback = view.getByRole("button", {
		name: "Edit and restart from here",
	});
	expect(fork.hasAttribute("disabled")).toBe(true);
	expect(fork.title).toBe(rollback.title);
	expect(fork.parentElement?.tabIndex).toBe(0);
});
