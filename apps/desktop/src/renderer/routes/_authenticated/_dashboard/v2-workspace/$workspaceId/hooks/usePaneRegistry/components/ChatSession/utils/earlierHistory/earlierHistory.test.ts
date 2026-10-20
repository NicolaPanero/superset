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

test("leaves out markup an agent injects under the user role", () => {
	const { items } = earlierHistory([
		{
			role: "user",
			timestampMs: 1,
			blocks: [
				{
					type: "text",
					text: '<external_codex_apps_open_page>{"page_id":null}</external_codex_apps_open_page>',
				},
				{ type: "text", text: '<image name=[Image #1] path="/tmp/a.png">' },
				{ type: "text", text: "</image>" },
				{ type: "text", text: "what is <b>this</b>?" },
			],
		},
	]);
	expect(
		[...items.values()].map(
			(entry) => (entry.item as { content: unknown[] }).content,
		),
	).toEqual([[{ type: "text", text: "what is <b>this</b>?" }]]);
});

test("keeps a user turn's images with its text and gives each page's items their own ids", () => {
	const { items } = earlierHistory([
		{
			index: 40,
			role: "user",
			timestampMs: 1,
			blocks: [
				{ type: "text", text: "look" },
				{ type: "image", mediaType: "image/png", data: "UE5H" },
				{ type: "image", mediaType: "image/png", omitted: true },
			],
		},
	]);
	expect([...items.keys()]).toEqual(["earlier-40-prompt"]);
	expect(items.get("earlier-40-prompt")?.item).toMatchObject({
		content: [{ type: "text", text: "look" }],
		earlierImages: [
			{ mediaType: "image/png", data: "UE5H" },
			{ mediaType: "image/png", data: undefined },
		],
	});
});
