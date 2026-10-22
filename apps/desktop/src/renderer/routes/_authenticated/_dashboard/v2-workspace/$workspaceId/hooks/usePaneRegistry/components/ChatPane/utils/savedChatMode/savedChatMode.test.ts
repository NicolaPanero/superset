import { expect, test } from "bun:test";
import { FULL_ACCESS_CHAT_MODE } from "@superset/chat/protocol";
import { resolveChatStartMode, withSavedMode } from "./savedChatMode";

test("keeps one mode per agent, newest last, and at most 32 agents", () => {
	expect(withSavedMode({ claude: "default" }, "claude", "auto")).toEqual({
		claude: "auto",
	});
	const full = Object.fromEntries(
		Array.from({ length: 32 }, (_, index) => [`agent${index}`, "default"]),
	);
	const next = withSavedMode(full, "codex", "read-only");
	expect(Object.keys(next)).toHaveLength(32);
	expect(next.agent0).toBeUndefined();
	expect(next.codex).toBe("read-only");
});

test("new chats default to Full access, while saved or explicit modes and resumed sessions keep their permissions", () => {
	expect(resolveChatStartMode(undefined, undefined, false)).toBe(
		FULL_ACCESS_CHAT_MODE,
	);
	expect(resolveChatStartMode(undefined, "ask", false)).toBe("ask");
	expect(resolveChatStartMode("plan", FULL_ACCESS_CHAT_MODE, false)).toBe(
		"plan",
	);
	expect(
		resolveChatStartMode(undefined, FULL_ACCESS_CHAT_MODE, true),
	).toBeUndefined();
	expect(resolveChatStartMode("ask", FULL_ACCESS_CHAT_MODE, true)).toBe("ask");
});
