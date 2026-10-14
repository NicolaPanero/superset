import { expect, test } from "bun:test";
import {
	AGENT_DEFAULT_MODE,
	FULL_ACCESS_CHAT_MODE,
} from "@superset/chat/protocol";
import {
	fullAccessAllowOption,
	fullAccessModes,
	fullAccessNativeMode,
} from "./forkFullAccess";

test("one full access choice is offered with native bypass or the per-chat policy", () => {
	expect(
		fullAccessModes(
			[
				{ id: "agent", label: "Agent" },
				{ id: "ask", label: "Ask" },
			],
			false,
		).map((mode) => mode.id),
	).toEqual(["agent", "ask", FULL_ACCESS_CHAT_MODE]);
	expect(
		fullAccessModes(
			[
				{ id: "default", label: "Default" },
				{ id: "bypassPermissions", label: "Bypass" },
			],
			false,
		).map((mode) => mode.id),
	).toEqual(["default", "bypassPermissions"]);
	expect(fullAccessModes([], false).map((mode) => mode.id)).toEqual([
		AGENT_DEFAULT_MODE,
		FULL_ACCESS_CHAT_MODE,
	]);
});
test("only advertised tool modes are selected, never an invented provider id", () => {
	expect(
		fullAccessNativeMode(
			[
				{ id: "agent", label: "Agent" },
				{ id: "ask", label: "Ask" },
			],
			"ask",
		),
	).toBe("agent");
	expect(
		fullAccessNativeMode(
			[
				{ id: "default", label: "Default" },
				{ id: "yolo", label: "YOLO" },
			],
			"default",
		),
	).toBe("yolo");
	expect(fullAccessNativeMode([], undefined)).toBeUndefined();
});
test("full access chooses per-action permission and never selects an unknown or reject option", () => {
	expect(
		fullAccessAllowOption([
			{ optionId: "deny", kind: "reject_once" },
			{ optionId: "always", kind: "allow_always" },
			{ optionId: "once", kind: "allow_once" },
		]),
	).toBe("once");
	expect(
		fullAccessAllowOption([{ optionId: "deny", kind: "reject_always" }]),
	).toBeUndefined();
	expect(fullAccessAllowOption([{ optionId: "anything" }])).toBeUndefined();
	expect(fullAccessAllowOption([{ optionId: "allow-once" }])).toBe(
		"allow-once",
	);
});
