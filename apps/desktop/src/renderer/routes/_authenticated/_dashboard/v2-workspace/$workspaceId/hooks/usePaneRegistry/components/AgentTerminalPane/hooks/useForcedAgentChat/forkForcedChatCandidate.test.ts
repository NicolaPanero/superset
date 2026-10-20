import { expect, test } from "bun:test";
import { forkForcedChatCandidate } from "./forkForcedChatCandidate";

const data = { agentSurface: "cli" as const };
const binding = {
	agentId: "grok",
	agentSessionId: "original-history",
	terminalId: "terminal",
	lastEventType: "Stop",
};
test.each([
	"grok",
	"cursor-agent",
	"claude",
	"codex",
	"gemini",
	"agy",
	"opencode",
	"pi",
])("%s defaults to a chat while keeping the original native history", (agentId) => {
	expect(
		forkForcedChatCandidate({
			advanced: false,
			data,
			binding: { ...binding, agentId },
		}),
	).toEqual({
		agent: {
			id: agentId,
			sessionId: "original-history",
			terminalId: "terminal",
		},
		waiting: false,
	});
});
test("advanced options preserve the user's chosen terminal surface", () => {
	expect(forkForcedChatCandidate({ advanced: true, data, binding })).toBeNull();
});
test.each([
	"Start",
	"PermissionRequest",
])("%s cannot be interrupted by automatic conversion", (lastEventType) => {
	expect(
		forkForcedChatCandidate({
			advanced: false,
			data,
			binding: { ...binding, lastEventType },
		})?.waiting,
	).toBe(true);
});
test("an ordinary shell, unsupported agent and missing history are never converted into a fake new chat", () => {
	expect(forkForcedChatCandidate({ advanced: false, data })).toBeNull();
	expect(
		forkForcedChatCandidate({
			advanced: false,
			data,
			binding: { ...binding, agentId: "amp" },
		}),
	).toBeNull();
	expect(
		forkForcedChatCandidate({
			advanced: false,
			data,
			binding: { ...binding, agentSessionId: undefined },
		}),
	).toBeNull();
});
test("saved native identity survives a dead binding and CLI preference", () => {
	expect(
		forkForcedChatCandidate({
			advanced: false,
			data: { ...data, agent: { id: "cursor-agent", sessionId: "saved" } },
			binding: { ...binding, endedAt: 1 },
		}),
	).toEqual({
		agent: { id: "cursor-agent", sessionId: "saved" },
		waiting: false,
	});
	expect(
		forkForcedChatCandidate({
			advanced: false,
			data: { agentSurface: "acp" },
			binding,
		}),
	).toBeNull();
});
