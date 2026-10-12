import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ForkAccountRegistry } from "./fork-account-registry";
import {
	AccountResetService,
	trustedResetIdentity,
} from "./fork-account-resets";
import { independentProfile } from "./fork-profile-directory";
import { ResetAttemptLedger } from "./fork-reset-attempts";
import { readAccountIdentity } from "./session-account/session-account";

function fixture(ledger?: ResetAttemptLedger) {
	let now = 1_800_000_000_000;
	let identity = { identity: "a".repeat(64), email: "work@example.invalid" };
	let remoteEmail = identity.email;
	let raw: unknown = {
		rateLimitResetCredits: {
			availableCount: 2,
			credits: [
				{
					id: "credit-1",
					resetType: "codexRateLimits",
					status: "available",
					expiresAt: now / 1000 + 3600,
				},
			],
		},
	};
	let response: unknown = { outcome: "reset" };
	let fail: string | null = null;
	let calls = 0,
		invalidations = 0;
	const requests: { method: string; params?: unknown }[] = [];
	const service = new AccountResetService({
		identity: async () => identity,
		rpc: async (_selection, run) => {
			calls++;
			return run({
				request: async (method, params) => {
					requests.push({ method, params });
					if (method === fail)
						throw new Error("offline secret-token must not escape");
					if (method === "account/read")
						return { account: { type: "chatgpt", email: remoteEmail } };
					if (method === "account/rateLimits/read") return raw;
					return response;
				},
			});
		},
		slot: async (run) => run(),
		restore: (selection, now) => ledger?.load(selection, now),
		save: (selection, attempt, now) => ledger?.save(selection, attempt, now),
		invalidate: async () => {
			invalidations++;
		},
		now: () => now,
	});
	const input = {
		selection: "/profile",
		expectedIdentity: identity.identity,
		idempotencyKey: "5c55a376-5263-41c5-a86c-3994ee645b48",
		creditId: "credit-1",
	};
	return {
		service,
		requests,
		input,
		calls: () => calls,
		invalidations: () => invalidations,
		raw: (v: unknown) => {
			raw = v;
		},
		response: (v: unknown) => {
			response = v;
		},
		fail: (v: string | null) => {
			fail = v;
		},
		time: (v: number) => {
			now += v;
		},
		change: () => {
			identity = { identity: "b".repeat(64), email: "other@example.invalid" };
			remoteEmail = identity.email;
		},
		remote: (v: string) => {
			remoteEmail = v;
		},
	};
}

test("reset reads share a five-minute cache, return only public details and never redeem", async () => {
	const f = fixture();
	const [a, b] = await Promise.all([
		f.service.read("/profile"),
		f.service.read("/profile"),
	]);
	expect(a).toEqual(b);
	expect(f.calls()).toBe(1);
	expect(a.availableCount).toBe(2);
	expect(a.credits?.[0]?.expiresAt).toBeInstanceOf(Date);
	expect(f.requests.map((row) => row.method)).toEqual([
		"account/read",
		"account/rateLimits/read",
	]);
	f.time(300_000);
	await f.service.read("/profile");
	expect(f.calls()).toBe(2);
});
test.each([
	{},
	{ rateLimitResetCredits: null },
])("missing reset support is unknown, not zero", async (raw) => {
	const f = fixture();
	f.raw(raw);
	const value = await f.service.read("/profile");
	expect(value.status).toBe("unsupported");
	expect(value.availableCount).toBeNull();
});
test("count-only replies are kept distinct from an empty detail list", async () => {
	const f = fixture();
	f.raw({ rateLimitResetCredits: { availableCount: 3 } });
	expect((await f.service.read("/profile")).credits).toBeNull();
	await f.service.consume({ ...f.input, creditId: undefined });
	expect(f.requests.at(-1)?.params).toEqual({
		idempotencyKey: f.input.idempotencyKey,
	});
});
test("expired, redeemed and unknown-type credits are not offered", async () => {
	const f = fixture();
	f.raw({
		rateLimitResetCredits: {
			availableCount: 3,
			credits: [
				{
					id: "expired",
					resetType: "codexRateLimits",
					status: "available",
					expiresAt: 1,
				},
				{ id: "used", resetType: "codexRateLimits", status: "redeemed" },
				{ id: "unknown", resetType: "newKind", status: "available" },
			],
		},
	});
	expect((await f.service.read("/profile")).credits).toEqual([]);
	await expect(f.service.consume(f.input)).rejects.toThrow(
		"reset_credit_unavailable",
	);
	expect(f.requests.some((row) => row.method.endsWith("/consume"))).toBe(false);
});
test("identity replacement invalidates the cache and an open confirmation", async () => {
	const f = fixture();
	await f.service.read("/profile");
	f.change();
	expect((await f.service.read("/profile")).email).toBe(
		"other@example.invalid",
	);
	await expect(f.service.consume(f.input)).rejects.toThrow(
		"reset_account_changed",
	);
	expect(f.requests.some((row) => row.method.endsWith("/consume"))).toBe(false);
});
test("the CLI must verify the same subscription email before redemption", async () => {
	const f = fixture();
	f.remote("other@example.invalid");
	await expect(f.service.consume(f.input)).rejects.toThrow(
		"reset_account_changed",
	);
	expect(f.requests.map((row) => row.method)).toEqual(["account/read"]);
});
test("failed reads retain unknown availability without leaking provider errors", async () => {
	const f = fixture();
	f.fail("account/rateLimits/read");
	const value = await f.service.read("/profile");
	expect(value.status).toBe("unavailable");
	expect(value.availableCount).toBeNull();
	expect(JSON.stringify(value)).not.toContain("secret-token");
	await f.service.read("/profile");
	expect(f.calls()).toBe(1);
});
test("simultaneous double-clicks and completed retries share one redemption", async () => {
	const f = fixture();
	await Promise.all([f.service.consume(f.input), f.service.consume(f.input)]);
	await f.service.consume(f.input);
	expect(
		f.requests.filter((row) => row.method.endsWith("/consume")),
	).toHaveLength(1);
	expect(f.invalidations()).toBe(1);
});
test("a lost response retries the same credit and key even if availability became zero", async () => {
	const f = fixture();
	f.fail("account/rateLimitResetCredit/consume");
	await expect(f.service.consume(f.input)).rejects.toThrow();
	expect(
		(await f.service.read("/profile")).pendingAttempt?.idempotencyKey,
	).toBe(f.input.idempotencyKey);
	await expect(
		f.service.consume({
			...f.input,
			idempotencyKey: "63c5a552-c381-499f-8d6d-c9bfbe1964d8",
		}),
	).rejects.toThrow("reset_attempt_pending");
	f.raw({ rateLimitResetCredits: { availableCount: 0, credits: [] } });
	f.fail(null);
	f.response({ outcome: "alreadyRedeemed" });
	expect(await f.service.consume(f.input)).toEqual({
		outcome: "alreadyRedeemed",
	});
	const attempts = f.requests.filter((row) => row.method.endsWith("/consume"));
	expect(attempts).toHaveLength(2);
	expect(attempts[0]?.params).toEqual(attempts[1]?.params);
});
test.each([
	"reset",
	"alreadyRedeemed",
	"nothingToReset",
	"noCredit",
])("the provider outcome %s is returned without guessing new quota", async (outcome) => {
	const f = fixture();
	f.response({ outcome });
	expect(await f.service.consume(f.input)).toEqual({ outcome });
	await f.service.read("/profile");
	expect(f.requests.at(-1)?.method).toBe("account/rateLimits/read");
});
test("zero availability and malformed replies cannot consume a reset", async () => {
	const f = fixture();
	f.raw({ rateLimitResetCredits: { availableCount: 0, credits: [] } });
	expect(await f.service.consume(f.input)).toEqual({ outcome: "noCredit" });
	f.raw({ rateLimitResetCredits: { availableCount: -1 } });
	f.time(300_000);
	expect((await f.service.read("/profile")).status).toBe("unavailable");
	expect(f.requests.some((row) => row.method.endsWith("/consume"))).toBe(false);
});

test("a real temporary profile must match its registered identity and own its auth file", async () => {
	const root = await mkdtemp(join(tmpdir(), "fork-reset-identity-"));
	try {
		const profile = join(root, "profile");
		await mkdir(profile);
		const auth = (email: string) =>
			JSON.stringify({
				tokens: {
					account_id: "account",
					id_token: `x.${Buffer.from(JSON.stringify({ sub: "user", email })).toString("base64url")}.x`,
				},
			});
		await writeFile(join(profile, "auth.json"), auth("work@example.invalid"));
		const registry = new ForkAccountRegistry(join(root, "registry"));
		const original = await readAccountIdentity("codex", profile);
		registry.remember({
			agent: "codex",
			selection: profile,
			credentialKind: "subscription",
			identity: original?.identity ?? null,
			email: original?.email ?? null,
		});
		const dependencies = {
			registry,
			identity: readAccountIdentity,
			independent: independentProfile,
		};
		if (!original) throw new Error("fixture_identity_missing");
		expect(await trustedResetIdentity(profile, dependencies)).toEqual(original);
		await writeFile(join(profile, "auth.json"), auth("other@example.invalid"));
		await expect(trustedResetIdentity(profile, dependencies)).rejects.toThrow(
			"reset_account_changed",
		);
		await expect(
			trustedResetIdentity(join(root, "unknown"), dependencies),
		).rejects.toThrow("reset_account_changed");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("an unconfirmed redemption reuses its stored operation after a host restart", async () => {
	const directory = await mkdtemp(join(tmpdir(), "fork-reset-ledger-"));
	try {
		const ledger = new ResetAttemptLedger(directory);
		const first = fixture(ledger);
		first.fail("account/rateLimitResetCredit/consume");
		await expect(first.service.consume(first.input)).rejects.toThrow();
		const second = fixture(new ResetAttemptLedger(directory));
		second.raw({ rateLimitResetCredits: { availableCount: 0, credits: [] } });
		second.response({ outcome: "alreadyRedeemed" });
		expect(
			(await second.service.read("/profile")).pendingAttempt?.idempotencyKey,
		).toBe(first.input.idempotencyKey);
		expect(await second.service.consume(first.input)).toEqual({
			outcome: "alreadyRedeemed",
		});
		expect(
			second.requests.find((row) => row.method.endsWith("/consume"))?.params,
		).toEqual(
			first.requests.find((row) => row.method.endsWith("/consume"))?.params,
		);
		expect(
			JSON.stringify(ledger.load("/profile", 1_800_000_000_000)),
		).not.toContain("work@example");
		expect(ledger.load("/profile", 1_800_086_400_000)).toBeUndefined();
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("a failed preflight does not lock the account to a reset that was never submitted", async () => {
	const f = fixture();
	f.raw({ rateLimitResetCredits: { availableCount: 1, credits: [] } });
	await expect(f.service.consume(f.input)).rejects.toThrow(
		"reset_credit_unavailable",
	);
	expect((await f.service.read("/profile")).pendingAttempt).toBeNull();
	f.raw({
		rateLimitResetCredits: {
			availableCount: 1,
			credits: [
				{ id: "credit-1", resetType: "codexRateLimits", status: "available" },
			],
		},
	});
	expect(
		await f.service.consume({
			...f.input,
			idempotencyKey: "63c5a552-c381-499f-8d6d-c9bfbe1964d8",
		}),
	).toEqual({ outcome: "reset" });
	expect(
		f.requests.filter((row) => row.method.endsWith("/consume")),
	).toHaveLength(1);
});
