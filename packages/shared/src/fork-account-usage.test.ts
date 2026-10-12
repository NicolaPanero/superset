import { expect, test } from "bun:test";
import { type AccountQuota, accountQuotaState } from "./fork-account-usage";

const now = Date.now();
const account: AccountQuota = {
	agent: "claude",
	credentialKind: "subscription",
	status: "ok",
	fetchedAt: new Date(now),
	windows: [
		{
			id: "five_hour",
			label: "Session",
			usedPercent: 99.6,
			resetsAt: new Date(now + 3600_000),
		},
		{
			id: "seven_day_sonnet",
			label: "Sonnet",
			usedPercent: 100,
			resetsAt: new Date(now + 3600_000),
		},
	],
};
test("model limits determine exhaustion without rounding general usage", () => {
	expect(accountQuotaState(account, "opus", now).reason).toBe("ready");
	expect(accountQuotaState(account, "opus", now).warning).toBe(true);
	expect(accountQuotaState(account, "sonnet", now).reason).toBe("exhausted");
});
test("stale, missing, invalid and API data never suggest unused quota", () => {
	expect(accountQuotaState(undefined, undefined, now).reason).toBe("unknown");
	expect(
		accountQuotaState(
			{ ...account, fetchedAt: new Date(now - 360_000) },
			"opus",
			now,
		).reason,
	).toBe("stale");
	expect(
		accountQuotaState({ ...account, status: "unavailable" }, "opus", now)
			.reason,
	).toBe("stale");
	expect(
		accountQuotaState(
			{
				...account,
				windows: [
					{
						id: "five_hour",
						label: "Session",
						usedPercent: Number.NaN,
						resetsAt: null,
					},
				],
			},
			"opus",
			now,
		).reason,
	).toBe("unknown");
	expect(
		accountQuotaState({ ...account, credentialKind: "api_key" }, undefined, now)
			.reason,
	).toBe("api");
});

test("a provider cache sample stays current through the next UI poll, but keeps its original age", () => {
	expect(
		accountQuotaState(
			{ ...account, fetchedAt: new Date(now - 330_000) },
			"opus",
			now,
		).reason,
	).toBe("ready");
	expect(
		accountQuotaState(
			{ ...account, fetchedAt: new Date(now - 360_000) },
			"opus",
			now,
		).reason,
	).toBe("stale");
	expect(
		accountQuotaState(
			{ ...account, windows: [], status: "token_stale" },
			"opus",
			now,
		).reason,
	).toBe("unknown");
	expect(
		accountQuotaState(
			{
				...account,
				windows: [
					{
						id: "five_hour",
						label: "Session",
						usedPercent: 20,
						resetsAt: new Date(now - 1),
					},
				],
			},
			"opus",
			now,
		).reason,
	).toBe("stale");
});

test.each([
	{
		name: "freshness boundary",
		patch: { fetchedAt: new Date(now - 359_999) },
		reason: "ready",
	},
	{
		name: "expired freshness",
		patch: { fetchedAt: new Date(now - 360_000) },
		reason: "stale",
	},
	{
		name: "future timestamp",
		patch: { fetchedAt: new Date(now + 1) },
		reason: "stale",
	},
	{
		name: "invalid timestamp",
		patch: { fetchedAt: new Date(Number.NaN) },
		reason: "stale",
	},
	{
		name: "signed-out account",
		patch: { status: "signed_out" },
		reason: "stale",
	},
	{
		name: "fraction below exhaustion",
		patch: {
			windows: [
				{
					id: "five_hour",
					label: "Session",
					usedPercent: 99.99,
					resetsAt: null,
				},
			],
		},
		reason: "ready",
	},
	{
		name: "exact exhaustion",
		patch: {
			windows: [
				{ id: "five_hour", label: "Session", usedPercent: 100, resetsAt: null },
			],
		},
		reason: "exhausted",
	},
	{
		name: "over exhaustion",
		patch: {
			windows: [
				{ id: "five_hour", label: "Session", usedPercent: 125, resetsAt: null },
			],
		},
		reason: "exhausted",
	},
	{
		name: "negative consumption",
		patch: {
			windows: [
				{ id: "five_hour", label: "Session", usedPercent: -1, resetsAt: null },
			],
		},
		reason: "unknown",
	},
	{
		name: "infinite consumption",
		patch: {
			windows: [
				{
					id: "five_hour",
					label: "Session",
					usedPercent: Infinity,
					resetsAt: null,
				},
			],
		},
		reason: "unknown",
	},
	{ name: "empty windows", patch: { windows: [] }, reason: "unknown" },
])("quota never becomes free for $name", ({ patch, reason }) => {
	const value = {
		...account,
		...patch,
		windows: (patch.windows ?? account.windows).map((window) => ({
			...window,
		})),
	};
	expect(accountQuotaState(value, "opus", now).reason).toBe(reason);
});

test("the tightest applicable window wins, with model-independent weekly limits", () => {
	const source = {
		...account,
		windows: [
			{ id: "five_hour", label: "Session", usedPercent: 10, resetsAt: null },
			{ id: "seven_day", label: "Weekly", usedPercent: 95, resetsAt: null },
			{ id: "seven_day_opus", label: "Opus", usedPercent: 100, resetsAt: null },
		],
	};
	expect(accountQuotaState(source, "sonnet", now)).toMatchObject({
		reason: "ready",
		remaining: 5,
		warning: true,
	});
	expect(accountQuotaState(source, "opus", now)).toMatchObject({
		reason: "exhausted",
		remaining: 0,
	});
});

test("the warning boundary is independent of whether quota is exhausted", () => {
	const value = (usedPercent: number) =>
		accountQuotaState(
			{
				...account,
				windows: [
					{ id: "primary", label: "Session", usedPercent, resetsAt: null },
				],
			},
			"opus",
			now,
		);
	expect(value(90).warning).toBe(false);
	expect(value(90.01).warning).toBe(true);
	expect(value(0)).toMatchObject({
		reason: "ready",
		remaining: 100,
		warning: false,
	});
});
