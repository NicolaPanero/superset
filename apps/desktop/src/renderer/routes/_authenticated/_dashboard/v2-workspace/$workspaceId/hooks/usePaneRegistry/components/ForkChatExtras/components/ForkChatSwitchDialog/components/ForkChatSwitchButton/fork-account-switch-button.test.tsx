import { expect, test } from "bun:test";
import { fireEvent, render } from "renderer/test-utils/fork-ui";
import { ForkChatSwitchButton } from "./ForkChatSwitchButton";

const defaults = {
	busy: false,
	sameAgent: true,
	canStop: true,
	switching: false,
	stage: null,
	blocked: false,
} as const;

test("an occupied Claude chat can stop and switch its account", () => {
	let switches = 0;
	const view = render(
		<ForkChatSwitchButton {...defaults} busy onSwitch={() => switches++} />,
	);
	fireEvent.click(
		view.getByRole("button", { name: "Stop and switch account" }),
	);
	expect(switches).toBe(1);
	view.rerender(
		<ForkChatSwitchButton {...defaults} onSwitch={() => switches++} />,
	);
	expect(
		view.getByRole("button", { name: "Switch" }).hasAttribute("disabled"),
	).toBe(false);
});

test("an occupied chat still blocks a handoff to another agent", () => {
	let switches = 0;
	const view = render(
		<ForkChatSwitchButton
			{...defaults}
			busy
			sameAgent={false}
			onSwitch={() => switches++}
		/>,
	);
	const button = view.getByRole("button", { name: "Switch" });
	expect(button.hasAttribute("disabled")).toBe(true);
	fireEvent.click(button);
	expect(switches).toBe(0);
});

test("an older host cannot switch an occupied account without stop support", () => {
	let switches = 0;
	const view = render(
		<ForkChatSwitchButton
			{...defaults}
			busy
			canStop={false}
			onSwitch={() => switches++}
		/>,
	);
	const button = view.getByRole("button", { name: "Switch" });
	expect(button.hasAttribute("disabled")).toBe(true);
	fireEvent.click(button);
	expect(switches).toBe(0);
	view.rerender(
		<ForkChatSwitchButton
			{...defaults}
			canStop={false}
			onSwitch={() => switches++}
		/>,
	);
	fireEvent.click(view.getByRole("button", { name: "Switch" }));
	expect(switches).toBe(1);
});

test("an account change in progress cannot be submitted again", () => {
	let switches = 0;
	const view = render(
		<ForkChatSwitchButton
			{...defaults}
			busy
			switching
			onSwitch={() => switches++}
		/>,
	);
	const button = view.getByRole("button", { name: "Switching account…" });
	expect(button.hasAttribute("disabled")).toBe(true);
	fireEvent.click(button);
	expect(switches).toBe(0);
});

test("stopping a busy chat does not bypass an unavailable target account", () => {
	let switches = 0;
	const view = render(
		<ForkChatSwitchButton
			{...defaults}
			busy
			blocked
			onSwitch={() => switches++}
		/>,
	);
	const button = view.getByRole("button", { name: "Stop and switch account" });
	expect(button.hasAttribute("disabled")).toBe(true);
	fireEvent.click(button);
	expect(switches).toBe(0);
});
