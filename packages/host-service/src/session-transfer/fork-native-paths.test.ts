import { expect, test } from "bun:test";
import type { TransferInput } from "./provider";
import { parseNativeTransferResult } from "./txcript";

const input: TransferInput = {
	sourceAgent: "claude",
	targetAgent: "codex",
	sourceSessionId: "source",
	sourceTerminalId: "fixture",
	sourceRoot: "C:\\profiles\\claude",
	sourceReference: "C:\\profiles\\claude\\session.jsonl",
	targetRoot: "C:\\profiles\\codex",
	cwd: "C:\\project with spaces",
};
const output = {
	protocolVersion: 1,
	engineVersion: "0.14.4-fork.12",
	targetAgent: "codex",
	targetSessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	reference: "\\\\?\\C:\\profiles\\codex\\session.jsonl",
	cwd: "\\\\?\\C:\\project with spaces",
	messageCount: 2,
	warnings: [],
};
test("Windows accepts Rust canonical paths and returns paths usable by agent CLIs", () => {
	expect(parseNativeTransferResult(output, input, "win32")).toMatchObject({
		reference: "C:\\profiles\\codex\\session.jsonl",
		cwd: input.cwd,
	});
});
test("Windows result validation rejects sibling stores, traversal, other drives and changed workspaces", () => {
	for (const change of [
		{ reference: "C:\\profiles\\codex-other\\session.jsonl" },
		{ reference: "C:\\profiles\\codex\\..\\foreign\\session.jsonl" },
		{ reference: "D:\\profiles\\codex\\session.jsonl" },
		{ cwd: "C:\\other" },
	])
		expect(() =>
			parseNativeTransferResult({ ...output, ...change }, input, "win32"),
		).toThrow("target_validation_failed");
});
test("Windows UNC canonical paths retain store containment", () => {
	const unc = {
		...input,
		targetRoot: "\\\\server\\share\\codex",
		cwd: "\\\\server\\share\\project",
	};
	const result = {
		...output,
		reference: "\\\\?\\UNC\\server\\share\\codex\\session.jsonl",
		cwd: "\\\\?\\UNC\\server\\share\\project",
	};
	expect(parseNativeTransferResult(result, unc, "win32")).toMatchObject({
		reference: "\\\\server\\share\\codex\\session.jsonl",
		cwd: unc.cwd,
	});
});
