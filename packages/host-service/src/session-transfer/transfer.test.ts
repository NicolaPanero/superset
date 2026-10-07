import { describe, expect, it } from "bun:test";
import { TransferJobs } from "./jobs";
import { ContextTransferProvider, type TransferInput } from "./provider";
import { TRANSFER_AGENTS } from "./registry";
import { parseNativeTransferResult, TxcriptTransferProvider } from "./txcript";

const input: TransferInput = {
	sourceAgent: "codex",
	targetAgent: "claude",
	sourceSessionId: "source",
	sourceTerminalId: "terminal",
	sourceRoot: "/source",
	sourceReference: "/source/session.jsonl",
	targetRoot: "/target/projects",
	cwd: "/repo",
};
const output = {
	protocolVersion: 1,
	engineVersion: "0.14.4-fork.3",
	targetAgent: "claude_code",
	targetSessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	reference: "/target/projects/repo/session.jsonl",
	cwd: "/repo",
	messageCount: 15,
	warnings: ["Structured output retained as JSON text."],
};

describe("session transfer", () => {
	it("returns a native ID only for a validated result in the selected store", () => {
		expect(parseNativeTransferResult(output, input)).toMatchObject({
			mode: "native",
			targetSessionId: output.targetSessionId,
			warnings: output.warnings,
		});
		for (const change of [
			{ reference: "/target/projects/../foreign/session.jsonl" },
			{ reference: "relative.jsonl" },
			{ cwd: "/other" },
			{ targetAgent: "codex" },
			{ engineVersion: "0.14.4" },
		]) {
			expect(() =>
				parseNativeTransferResult({ ...output, ...change }, input),
			).toThrow();
		}
	});
	it("keeps context available without inventing a native session ID", async () => {
		const result = await new ContextTransferProvider().transfer({
			...input,
			transcript: "[earlier output omitted]\nAssistant: done",
		});
		expect(result.mode).toBe("context");
		expect(result).not.toHaveProperty("targetSessionId");
		expect(result.warnings.length).toBe(1);
		if (result.mode === "context")
			expect(result.prompt).toContain("read-only historical context");
	});
	it("distinguishes declared adapters from verified runtime support", async () => {
		expect(Object.keys(TRANSFER_AGENTS)).toHaveLength(5);
		const provider = new TxcriptTransferProvider("/missing/helper");
		expect(await provider.canTransfer("codex", "grok")).toBe(false);
		expect(await provider.isAvailable()).toBe(false);
	});
	it("coalesces concurrent conversion retries and refuses changed input", async () => {
		const jobs = new TransferJobs<number>();
		let calls = 0;
		const create = async () => ++calls;
		const results = await Promise.all([
			jobs.run("org:id", "same", create),
			jobs.run("org:id", "same", create),
		]);
		expect(results).toEqual([1, 1]);
		expect(calls).toBe(1);
		expect(() => jobs.run("org:id", "changed", create)).toThrow(
			"transfer_id_conflict",
		);
		expect(await jobs.get("org:id")).toBe(1);
		expect(jobs.get("other-org:id")).toBeUndefined();
	});
	it("bounds retained jobs and refuses duplicate retries after expiry", async () => {
		let now = 100;
		const jobs = new TransferJobs<number>(1, 1, () => now);
		await jobs.run("a", "a", async () => 1);
		expect(() => jobs.run("b", "b", async () => 2)).toThrow(
			"transfer_limit_reached",
		);
		now += 2;
		expect(jobs.get("a")).toBeUndefined();
		expect(await jobs.run("b", "b", async () => 2)).toBe(2);
	});
	it("cancels an in-flight helper and rejects a late prepare with the same ID", async () => {
		const jobs = new TransferJobs<number>();
		let signal: AbortSignal | undefined;
		const pending = jobs.run("org:id", "same", async (value) => {
			signal = value;
			return new Promise<number>((_resolve, reject) => {
				value.addEventListener("abort", () => reject(new Error("cancelled")));
			});
		});
		await Promise.resolve();
		jobs.cancel("org:id");
		expect(signal?.aborted).toBe(true);
		await expect(pending).rejects.toThrow("cancelled");
		expect(jobs.get("org:id")).toBeUndefined();
		expect(() => jobs.run("org:id", "same", async () => 1)).toThrow(
			"transfer_cancelled",
		);
		jobs.cancel("org:early");
		expect(() => jobs.run("org:early", "same", async () => 1)).toThrow(
			"transfer_cancelled",
		);
	});
});
