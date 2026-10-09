import { describe, expect, test } from "bun:test";
import { type LineageEdge, lineageRows } from "./lineageRows";

const node = (agent: string, sessionId: string) => ({
	agent,
	label: agent,
	sessionId,
});
const edge = (
	from: string,
	to: string,
	createdAt: number,
	agents: [string, string],
): LineageEdge => ({
	sourceNodeId: from,
	targetNodeId: to,
	createdAt,
	warnings: [],
	source: node(agents[0], from),
	target: node(agents[1], to),
});

describe("lineageRows", () => {
	test("follows a chain of handoffs as one conversation", () => {
		const [rows] = lineageRows([
			edge("c2", "g1", 3, ["codex", "grok"]),
			edge("a1", "c2", 2, ["claude", "codex"]),
			edge("c1", "a1", 1, ["codex", "claude"]),
		]);
		expect(rows?.map((row) => [row.agent, row.depth, row.latest])).toEqual([
			["codex", 0, false],
			["claude", 0, false],
			["codex", 0, false],
			["grok", 0, true],
		]);
		expect(rows?.[0]?.handedOverAt).toBeNull();
	});

	test("indents branches and orders conversations newest first", () => {
		const conversations = lineageRows([
			edge("x", "y", 1, ["claude", "codex"]),
			edge("r", "a", 2, ["claude", "grok"]),
			edge("r", "b", 5, ["claude", "codex"]),
		]);
		expect(conversations.map((rows) => rows[0]?.nodeId)).toEqual(["r", "x"]);
		expect(
			conversations[0]?.map((row) => [row.nodeId, row.depth, row.latest]),
		).toEqual([
			["r", 0, false],
			["a", 1, false],
			["b", 1, true],
		]);
	});
});
