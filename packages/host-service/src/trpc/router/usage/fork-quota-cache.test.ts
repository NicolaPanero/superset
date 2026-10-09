import { expect, test } from "bun:test";
import { reconcileQuota } from "./fork-quota-cache";
import type { UsageAccount } from "./types";

const now = Date.now();
const account: UsageAccount = {
	agent: "claude",
	credentialKind: "subscription",
	accountKey: "test",
	sourceLabel: "test",
	email: "test@example.invalid",
	plan: "max",
	status: "ok",
	statusDetail: null,
	windows: [
		{
			id: "five_hour",
			label: "Session",
			usedPercent: 40,
			resetsAt: new Date(now + 3600_000),
		},
	],
	creditsBalance: null,
	extraUsage: null,
	selection: null,
	isDefault: true,
	fetchedAt: new Date(now - 1000),
	identityFingerprint: "fake-identity",
};
test("failed reads retain the original timestamp only for the same identity", () => {
	const snapshots = new Map<string, UsageAccount>();
	reconcileQuota([account], snapshots, now);
	const stale = {
		...account,
		status: "token_stale" as const,
		fetchedAt: new Date(now),
		windows: [],
	};
	const restored = reconcileQuota([stale], snapshots, now)[0];
	expect(restored?.windows).toEqual(account.windows);
	expect(restored?.fetchedAt).toEqual(account.fetchedAt);
	const changed = reconcileQuota(
		[{ ...stale, identityFingerprint: "another-login" }],
		snapshots,
		now,
	)[0];
	expect(changed?.windows).toEqual([]);
	expect(snapshots.size).toBe(0);
});
test("removed accounts, 24-hour snapshots and account overflow are discarded", () => {
	const snapshots = new Map<string, UsageAccount>();
	const rows = Array.from({ length: 130 }, (_, index) => ({
		...account,
		accountKey: String(index),
	}));
	expect(reconcileQuota(rows, snapshots, now)).toHaveLength(128);
	expect(snapshots.size).toBe(128);
	reconcileQuota([], snapshots, now);
	expect(snapshots.size).toBe(0);
	reconcileQuota([account], snapshots, now);
	expect(
		reconcileQuota(
			[{ ...account, status: "unavailable", windows: [] }],
			snapshots,
			now + 24 * 3600_000,
		)[0]?.windows,
	).toEqual([]);
	expect(snapshots.size).toBe(0);
});
