import { expect, test } from "bun:test";
import {
	bindQuotaProfileIdentity,
	includeClaudeSystemLogin,
	reconcileQuota,
} from "./fork-quota-cache";
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

test("a disconnected system login cannot inherit a named profile's identity or quota", () => {
	const btcore = {
		...account,
		selection: "/profiles/btcore",
		accountKey: "btcore",
	};
	const innovation = {
		...account,
		selection: "/profiles/innovation",
		accountKey: "innovation",
		email: "innovation@example.invalid",
	};
	const snapshots = new Map<string, UsageAccount>();
	reconcileQuota([account], snapshots, now);
	const result = reconcileQuota(
		includeClaudeSystemLogin([btcore, innovation], now),
		snapshots,
		now,
	);
	expect(result[0]).toMatchObject({
		selection: null,
		email: null,
		status: "signed_out",
		windows: [],
	});
	expect(result.slice(1)).toMatchObject([btcore, innovation]);
	expect([...snapshots.values()].some((row) => row.selection === null)).toBe(
		false,
	);
	expect(includeClaudeSystemLogin([account], now)).toEqual([account]);
});

test("renewing a profile token preserves the last successful quota for the same verified account", async () => {
	const snapshots = new Map<string, UsageAccount>();
	const profile = {
		...account,
		selection: "/profiles/work",
		identityFingerprint: "old-token",
	};
	const identity = async () => ({
		identity: "same-account-uuid",
		email: profile.email as string,
	});
	const before = await bindQuotaProfileIdentity([profile], identity);
	reconcileQuota(before, snapshots, now);
	const after = await bindQuotaProfileIdentity(
		[
			{
				...profile,
				identityFingerprint: "new-token",
				status: "unavailable",
				windows: [],
				fetchedAt: new Date(now),
			},
		],
		identity,
	);
	const result = reconcileQuota(after, snapshots, now)[0];
	expect(result?.windows).toEqual(account.windows);
	expect(result?.status).toBe("unavailable");
	expect(result?.fetchedAt).toEqual(account.fetchedAt);
});

test("the same email on another profile identity cannot inherit quota", async () => {
	const profile = { ...account, selection: "/profiles/work" };
	const snapshots = new Map<string, UsageAccount>();
	reconcileQuota(
		await bindQuotaProfileIdentity([profile], async () => ({
			identity: "original",
			email: profile.email as string,
		})),
		snapshots,
		now,
	);
	const changed = await bindQuotaProfileIdentity(
		[{ ...profile, status: "unavailable", windows: [] }],
		async () => ({ identity: "different", email: profile.email as string }),
	);
	expect(reconcileQuota(changed, snapshots, now)[0]?.windows).toEqual([]);
	expect(snapshots.size).toBe(0);
});

test("an unavailable local identity or a different provider email keeps token-based isolation", async () => {
	const profile = { ...account, selection: "/profiles/work" };
	expect((await bindQuotaProfileIdentity([profile], async () => null))[0]).toBe(
		profile,
	);
	expect(
		(
			await bindQuotaProfileIdentity([profile], async () => ({
				identity: "same-account",
				email: "other@example.invalid",
			}))
		)[0],
	).toBe(profile);
});

test("signed-out, API and mutable system logins cannot borrow a named profile identity", async () => {
	const rows: UsageAccount[] = [
		account,
		{ ...account, selection: "/profiles/work", status: "signed_out" },
		{ ...account, selection: "/profiles/api", credentialKind: "api_key" },
	];
	let reads = 0;
	expect(
		await bindQuotaProfileIdentity(rows, async () => {
			reads++;
			return { identity: "wrong", email: account.email as string };
		}),
	).toEqual(rows);
	expect(reads).toBe(0);
});

test("Codex token rotation retains only quota belonging to the verified profile identity", async () => {
	const profile = {
		...account,
		agent: "codex" as const,
		selection: "/profiles/codex",
		identityFingerprint: "old-token",
	};
	const normalized = await bindQuotaProfileIdentity(
		[profile, { ...profile, identityFingerprint: "renewed-token" }],
		async () => ({
			identity: "codex-account-id",
			email: profile.email as string,
		}),
	);
	expect(normalized[0]?.identityFingerprint).toBe(
		normalized[1]?.identityFingerprint,
	);
});
