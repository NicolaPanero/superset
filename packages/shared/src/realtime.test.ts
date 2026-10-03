import { describe, expect, test } from "bun:test";
import { isRealtimeUpdate, mergePresenceByUser } from "./realtime";

describe("mergePresenceByUser", () => {
	test("an older update arriving late does not undo a newer one", () => {
		const merged = mergePresenceByUser(
			[
				{ userId: "kiet", lastSeenAt: 200 },
				{ userId: "satya", lastSeenAt: 150 },
			],
			[{ userId: "kiet", lastSeenAt: 100 }],
			(person) => person.lastSeenAt,
		);

		expect(merged).toEqual([
			{ userId: "kiet", lastSeenAt: 200 },
			{ userId: "satya", lastSeenAt: 150 },
		]);
	});

	test("adds new people and keeps the most recently seen first", () => {
		const merged = mergePresenceByUser(
			[{ userId: "satya", lastSeenAt: 150 }],
			[
				{ userId: "avi", lastSeenAt: 300 },
				{ userId: "satya", lastSeenAt: 160 },
			],
			(person) => person.lastSeenAt,
		);

		expect(merged).toEqual([
			{ userId: "avi", lastSeenAt: 300 },
			{ userId: "satya", lastSeenAt: 160 },
		]);
	});
});

describe("isRealtimeUpdate", () => {
	const base = { kind: "cloud_workspaces", workspaceId: "w" };

	test("accepts a diff-stats-only patch", () => {
		expect(
			isRealtimeUpdate({
				...base,
				diffStats: { additions: 3, deletions: 1, at: 1_000 },
			}),
		).toBe(true);
	});

	test("rejects negative or fractional line counts", () => {
		for (const diffStats of [
			{ additions: -1, deletions: 0, at: 1 },
			{ additions: 1.5, deletions: 0, at: 1 },
			{ additions: 1, deletions: 0 },
		]) {
			expect(isRealtimeUpdate({ ...base, diffStats })).toBe(false);
		}
	});

	test("rejects a patch that changes nothing", () => {
		expect(isRealtimeUpdate(base)).toBe(false);
	});
});
