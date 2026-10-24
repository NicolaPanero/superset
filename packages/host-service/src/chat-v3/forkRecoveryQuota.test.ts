import { expect, test } from "bun:test";
import type { SessionAccount } from "../trpc/router/usage/session-account/session-account";
import type { UsageAccount } from "../trpc/router/usage/types";
import { forkRecoveryQuota } from "./forkRecoveryQuota";

const account: SessionAccount = {
	agent: "codex",
	selection: "/work",
	credentialKind: "subscription",
	identity: "work-identity",
};
const sample: UsageAccount = {
	agent: "codex",
	selection: "/work",
	credentialKind: "subscription",
	status: "token_stale",
	accountKey: "work",
	sourceLabel: "Work",
	email: "work@example.invalid",
	plan: "plus",
	statusDetail: null,
	windows: [],
	creditsBalance: null,
	extraUsage: null,
	isDefault: false,
	fetchedAt: new Date(),
};

test("background recovery refreshes the captured account through its CLI and rereads quota without a renderer", async () => {
	let reads = 0;
	const probes: unknown[] = [];
	const fresh = { ...sample, status: "ok" as const };
	expect(
		await forkRecoveryQuota("codex", account, {
			read: async () => (++reads === 1 ? [sample] : [fresh]),
			probe: async (agent, selection) => {
				probes.push({ agent, selection });
				return { status: "checked" };
			},
			validate: async () => true,
		}),
	).toEqual([fresh]);
	expect(probes).toEqual([{ agent: "codex", selection: "/work" }]);
	expect(reads).toBe(2);
});

test("an unreadable or changed login cannot trigger an automatic account probe", async () => {
	let probes = 0;
	for (const [source, row, valid] of [
		[account, { ...sample, status: "ok" }, true],
		[account, { ...sample, status: "signed_out" }, true],
		[{ ...account, credentialKind: "api_key" }, sample, true],
		[account, { ...sample, selection: "/another-account" }, true],
		[account, sample, false],
	] as const) {
		await forkRecoveryQuota("codex", source, {
			read: async () => [row],
			probe: async () => {
				probes++;
				return { status: "checked" };
			},
			validate: async () => valid,
		});
	}
	expect(probes).toBe(0);
});

test("an identity change during verification cannot supply fresh quota to the old session", async () => {
	let reads = 0;
	let checks = 0;
	expect(
		await forkRecoveryQuota("codex", account, {
			read: async () => {
				reads++;
				return [sample];
			},
			probe: async () => ({ status: "checked" }),
			validate: async () => ++checks === 1,
		}),
	).toEqual([sample]);
	expect(reads).toBe(1);
	expect(checks).toBe(2);
});
