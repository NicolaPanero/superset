import { expect, test } from "bun:test";
import { earlierHistory } from "./earlierHistory";

test("groups what follows a user message into its turn and pairs tool output", () => {
	const { turns, items } = earlierHistory([
		{ role: "user", timestampMs: 1, blocks: [{ type: "text", text: "hi" }] },
		{
			role: "assistant",
			timestampMs: 2,
			blocks: [
				{ type: "text", text: "hello" },
				{
					type: "tool",
					id: "t",
					name: "Bash",
					input: "ls",
					output: "a",
					isError: true,
				},
			],
		},
		{ role: "user", timestampMs: 3, blocks: [{ type: "text", text: "again" }] },
	]);
	expect(turns.size).toBe(2);
	const stored = [...items.values()];
	expect(stored.map((entry) => entry.item.kind)).toEqual([
		"user_message",
		"agent_message",
		"tool_call",
		"user_message",
	]);
	expect(stored[2]?.turnId).toBe("earlier-turn-0");
	expect(stored[2]?.item).toMatchObject({
		toolKind: "execute",
		status: "failed",
	});
});
