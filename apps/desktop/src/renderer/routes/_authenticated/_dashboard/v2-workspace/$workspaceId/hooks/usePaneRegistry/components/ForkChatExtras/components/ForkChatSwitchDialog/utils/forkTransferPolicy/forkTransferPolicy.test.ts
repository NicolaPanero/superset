import { expect, test } from "bun:test";
import { forkTransferPolicy, runForkTransfer } from "./forkTransferPolicy";

test("clicking Switch before native support is ready sends no context prompt and later uses native handoff", async () => {
	const calls: string[] = [];
	const actions = {
		native: async () => {
			calls.push("native");
		},
		context: async () => {
			calls.push("context");
		},
	};
	const pending = forkTransferPolicy("native", false);
	await runForkTransfer(pending, actions);
	expect(calls).toEqual([]);
	await runForkTransfer(forkTransferPolicy(pending.mode, true), actions);
	expect(calls).toEqual(["native"]);
});

test("a failed native transfer cannot silently launch a summary chat", async () => {
	let summaryCalls = 0;
	await expect(
		runForkTransfer(forkTransferPolicy("native", true), {
			native: async () => {
				throw new Error("Conversion failed");
			},
			context: async () => {
				summaryCalls++;
			},
		}),
	).rejects.toThrow("Conversion failed");
	expect(summaryCalls).toBe(0);
});

test("a summary can launch on an unsupported host only after an explicit Summary only choice", async () => {
	const calls: string[] = [];
	const actions = {
		native: async () => {
			calls.push("native");
		},
		context: async () => {
			calls.push("context");
		},
	};
	await runForkTransfer(forkTransferPolicy("native", false), actions);
	expect(calls).toEqual([]);
	await runForkTransfer(forkTransferPolicy("context", false), actions);
	expect(calls).toEqual(["context"]);
});
