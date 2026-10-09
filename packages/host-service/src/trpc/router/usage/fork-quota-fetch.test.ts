import { expect, test } from "bun:test";
import {
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
