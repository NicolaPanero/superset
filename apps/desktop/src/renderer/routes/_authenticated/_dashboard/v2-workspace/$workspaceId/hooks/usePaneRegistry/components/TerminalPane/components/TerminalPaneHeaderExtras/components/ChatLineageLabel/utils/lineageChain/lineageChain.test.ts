import { describe, expect, it } from "bun:test";
import { type LineageEdge, lineageChain } from "./lineageChain";

const node = (agent: string, sessionId: string, label: string) => ({
	agent,
	sessionId,
	label,
});
const claude1 = node("claude", "c1", "Claude Code");
const codex = node("codex", "x1", "Codex");
const grok = node("grok", "g1", "Grok Build");
const claude2 = node("claude", "c2", "Claude Code");
const edges: LineageEdge[] = [
	{ createdAt: 1, source: claude1, target: codex },
	{ createdAt: 2, source: codex, target: grok },
	{ createdAt: 3, source: grok, target: claude2 },
];

describe("lineageChain", () => {
	it("walks back to the first agent of the conversation", () => {
		expect(lineageChain(edges, "claude", "c2")).toEqual({
			from: ["Claude Code", "Codex", "Grok Build"],
			continuedIn: null,
		});
	});

	it("tells an earlier session where the conversation went next", () => {
		expect(lineageChain(edges, "codex", "x1")).toEqual({
			from: ["Claude Code"],
			continuedIn: "Grok Build",
		});
		expect(lineageChain(edges, "claude", "c1")).toEqual({
			from: [],
			continuedIn: "Codex",
		});
	});

	it("stops on a cycle and ignores unrelated sessions", () => {
		const loop: LineageEdge[] = [
			{ createdAt: 1, source: claude1, target: codex },
			{ createdAt: 2, source: codex, target: claude1 },
		];
		expect(lineageChain(loop, "claude", "c1").from.length).toBeLessThanOrEqual(
			8,
		);
		expect(lineageChain(edges, "opencode", "o1")).toEqual({
			from: [],
			continuedIn: null,
		});
	});
});
