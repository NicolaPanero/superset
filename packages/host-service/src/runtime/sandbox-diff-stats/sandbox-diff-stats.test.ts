import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { startSandboxDiffStatsReporter } from "./sandbox-diff-stats";

describe("startSandboxDiffStatsReporter", () => {
	const realFetch = globalThis.fetch;
	let sent: { additions: number; deletions: number; organizationId: string }[];
	let status: number;
	let stats: { additions: number; deletions: number };
	let changed: () => void;
	let stop: () => void;

	async function advance(ms: number) {
		jest.advanceTimersByTime(ms);
		for (let i = 0; i < 10; i++) await Promise.resolve();
	}

	beforeEach(() => {
		jest.useFakeTimers();
		sent = [];
		status = 200;
		stats = { additions: 3, deletions: 1 };
		globalThis.fetch = (async (_url: string, init: RequestInit) => {
			sent.push(JSON.parse(String(init.body)));
			return new Response(null, { status });
		}) as typeof fetch;
		stop = startSandboxDiffStatsReporter({
			apiUrl: "https://api.test",
			workspaceId: "w",
			organizationId: "o",
			hostSecret: "s",
			read: async () => stats,
			watch: (listener) => {
				changed = listener;
				return () => {};
			},
		});
	});

	afterEach(() => {
		stop();
		globalThis.fetch = realFetch;
		jest.useRealTimers();
	});

	test("reports once on start, then only when the counts change", async () => {
		await advance(10_000);
		expect(sent).toEqual([{ ...sent[0], additions: 3, deletions: 1 }]);
		expect(sent[0]?.organizationId).toBe("o");

		changed();
		await advance(10_000);
		expect(sent).toHaveLength(1);

		stats = { additions: 5, deletions: 1 };
		changed();
		await advance(10_000);
		expect(sent.map((s) => s.additions)).toEqual([3, 5]);
	});

	test("sends at most once per 10s however often the tree changes", async () => {
		await advance(10_000);
		for (let i = 1; i <= 8; i++) {
			stats = { additions: 3 + i, deletions: 1 };
			changed();
			await advance(1_000);
		}
		expect(sent.length).toBeLessThanOrEqual(2);
		await advance(10_000);
		expect(sent.at(-1)?.additions).toBe(11);
	});

	test("retries a failed report with growing waits", async () => {
		status = 500;
		await advance(2_000);
		expect(sent).toHaveLength(1);
		await advance(10_000);
		expect(sent).toHaveLength(2);
		await advance(19_000);
		expect(sent).toHaveLength(2);
		await advance(1_000);
		expect(sent).toHaveLength(3);
		status = 200;
		await advance(40_000);
		expect(sent).toHaveLength(4);
		await advance(60_000);
		expect(sent).toHaveLength(4);
	});
});
