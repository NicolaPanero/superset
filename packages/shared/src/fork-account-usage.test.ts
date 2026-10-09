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
			{ ...account, fetchedAt: new Date(now - 300_000) },
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
