import { describe, expect, it } from "bun:test";
import {
	WaitForOutputTimeoutError,
	waitForOutputMatch,
} from "./wait-for-output";

function fakeClock(startAt = 0) {
	let current = startAt;
	return {
		now: () => current,
		advance: (ms: number) => {
			current += ms;
		},
	};
}

describe("waitForOutputMatch", () => {
	it("resolves at once when the text already matches, without sleeping", async () => {
		const sleeps: number[] = [];
		const result = await waitForOutputMatch(
			{
				readText: () => Promise.resolve("build passed: 12 tests"),
				sleep: (ms) => {
					sleeps.push(ms);
					return Promise.resolve();
				},
			},
			{ regex: /passed|failed/, timeoutMs: 10_000, pollIntervalMs: 500 },
		);

		expect(result).toEqual({ text: "build passed: 12 tests", match: "passed" });
		expect(sleeps).toEqual([]);
	});

	it("polls until a later read matches", async () => {
		const reads = ["waiting...", "still waiting...", "done: passed"];
		let i = 0;
		const sleeps: number[] = [];

		const result = await waitForOutputMatch(
			{
				readText: () => Promise.resolve(reads[i++] as string),
				sleep: (ms) => {
					sleeps.push(ms);
					return Promise.resolve();
				},
			},
			{ regex: /passed|failed/, timeoutMs: 10_000, pollIntervalMs: 250 },
		);

		expect(result).toEqual({ text: "done: passed", match: "passed" });
		expect(sleeps).toEqual([250, 250]);
	});

	it("throws WaitForOutputTimeoutError once the deadline passes without a match", async () => {
		const clock = fakeClock();
		await expect(
			waitForOutputMatch(
				{
					readText: () => Promise.resolve("nothing here"),
					sleep: (ms) => {
						clock.advance(ms);
						return Promise.resolve();
					},
					now: clock.now,
				},
				{ regex: /passed|failed/, timeoutMs: 1_000, pollIntervalMs: 300 },
			),
		).rejects.toThrow(WaitForOutputTimeoutError);
	});

	it("shortens the final poll to what is left and does not read past the deadline", async () => {
		const clock = fakeClock();
		const sleeps: number[] = [];
		let reads = 0;

		await expect(
			waitForOutputMatch(
				{
					readText: () => {
						reads++;
						return Promise.resolve("nope");
					},
					sleep: (ms) => {
						sleeps.push(ms);
						clock.advance(ms);
						return Promise.resolve();
					},
					now: clock.now,
				},
				{ regex: /xyz/, timeoutMs: 1_000, pollIntervalMs: 400 },
			),
		).rejects.toThrow(WaitForOutputTimeoutError);

		expect(sleeps).toEqual([400, 400, 200]);
		expect(reads).toBe(3);
	});

	it("returns at the deadline even when a read never settles, and aborts that read", async () => {
		let seen: AbortSignal | undefined;
		const startedAt = performance.now();

		await expect(
			waitForOutputMatch(
				{
					readText: (signal) => {
						seen = signal;
						return new Promise<string>(() => {});
					},
					sleep: () => Promise.resolve(),
				},
				{ regex: /x/, timeoutMs: 30, pollIntervalMs: 5 },
			),
		).rejects.toThrow(WaitForOutputTimeoutError);

		expect(performance.now() - startedAt).toBeLessThan(1_000);
		expect(seen?.aborted).toBe(true);
	});

	it("propagates a readText failure instead of retrying silently", async () => {
		await expect(
			waitForOutputMatch(
				{
					readText: () => Promise.reject(new Error("host unreachable")),
					sleep: () => Promise.resolve(),
				},
				{ regex: /x/, timeoutMs: 1_000, pollIntervalMs: 100 },
			),
		).rejects.toThrow("host unreachable");
	});
});
