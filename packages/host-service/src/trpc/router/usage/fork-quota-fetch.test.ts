import { expect, spyOn, test } from "bun:test";
import {
	expireQuotaFetches,
	invalidateQuotaFetch,
	quotaFetch,
	quotaResponseTiming,
	retryAfterMs,
} from "./fork-quota-fetch";

test("concurrent and explicit refreshes share requests and respect Retry-After", async () => {
	let calls = 0;
	const server = Bun.serve({
		port: 0,
		fetch: () => {
			calls++;
			return new Response("limited", {
				status: 429,
				headers: { "Retry-After": "1200" },
			});
		},
	});
	try {
		const url = `http://localhost:${server.port}/quota`;
		const init = { headers: { Authorization: "Bearer test-only" } };
		const [a, b] = await Promise.all([
			quotaFetch(url, init, "test-profile"),
			quotaFetch(url, init, "test-profile"),
		]);
		await invalidateQuotaFetch(url, "test-profile");
		const fresh = await quotaFetch(
			url,
			{ headers: { Authorization: "Bearer rotated-test-only" } },
			"test-profile",
		);
		expect(calls).toBe(1);
		expect(await a.json().catch(() => a.status)).toBe(429);
		expect(b.status).toBe(429);
		const timing = quotaResponseTiming(fresh);
		expect(timing.fetchedAt).toEqual(quotaResponseTiming(b).fetchedAt);
		if (!timing.retryAt) throw new Error("missing_retry_after");
		expect(timing.retryAt.getTime() - timing.fetchedAt.getTime()).toBe(
			1200_000,
		);
	} finally {
		await server.stop(true);
	}
});
test("HTTP-date retry delays are preserved", () => {
	const now = Date.parse("2026-10-09T12:00:00Z");
	expect(retryAfterMs("Fri, 09 Oct 2026 12:30:00 GMT", now)).toBe(1800_000);
	expect(retryAfterMs("10", now)).toBe(10_000);
});

test("frequent UI reads preserve the sample timestamp and fetch again after the provider interval", async () => {
	let now = Date.parse("2026-10-09T12:00:00Z"),
		calls = 0;
	const clock = spyOn(Date, "now").mockImplementation(() => now);
	const server = Bun.serve({
		port: 0,
		fetch: () => {
			calls++;
			return Response.json({ used: 40 });
		},
	});
	try {
		const url = `http://localhost:${server.port}/successful-quota`;
		const first = quotaResponseTiming(await quotaFetch(url, {}));
		now += 30_000;
		const reused = quotaResponseTiming(await quotaFetch(url, {}));
		expect(calls).toBe(1);
		expect(reused.fetchedAt).toEqual(first.fetchedAt);
		now += 270_000;
		const fresh = quotaResponseTiming(await quotaFetch(url, {}));
		expect(calls).toBe(2);
		expect(fresh.fetchedAt.getTime() - first.fetchedAt.getTime()).toBe(300_000);
	} finally {
		clock.mockRestore();
		await server.stop(true);
	}
});

test("a reset invalidates only its own cached quota, preserving other accounts", async () => {
	let calls = 0;
	const server = Bun.serve({
		port: 0,
		fetch: () => Response.json({ read: ++calls }),
	});
	try {
		const url = `http://localhost:${server.port}/reset-quota`;
		await quotaFetch(url, {}, "profile-a");
		await quotaFetch(url, {}, "profile-b");
		await invalidateQuotaFetch(url, "profile-a");
		await quotaFetch(url, {}, "profile-a");
		await quotaFetch(url, {}, "profile-b");
		expect(calls).toBe(3);
	} finally {
		await server.stop(true);
	}
});

test("expiring reads refetches usage but keeps a provider's Retry-After", async () => {
	const calls = { ok: 0, limited: 0 };
	const server = Bun.serve({
		port: 0,
		fetch: (request) => {
			if (new URL(request.url).pathname === "/limited") {
				calls.limited++;
				return new Response("limited", {
					status: 429,
					headers: { "Retry-After": "600" },
				});
			}
			calls.ok++;
			return Response.json({ used: calls.ok });
		},
	});
	try {
		const base = `http://localhost:${server.port}`;
		const init = { headers: { Authorization: "Bearer test-only" } };
		await quotaFetch(`${base}/usage`, init, "expire-profile");
		await quotaFetch(`${base}/limited`, init, "expire-profile");
		expireQuotaFetches();
		await quotaFetch(`${base}/usage`, init, "expire-profile");
		await quotaFetch(`${base}/limited`, init, "expire-profile");
		expect(calls).toEqual({ ok: 2, limited: 1 });
	} finally {
		await server.stop(true);
	}
});
