import { expect, test } from "bun:test";
import { forkFetch, forkText } from "./fork-http";

test("JSON reads follow same-origin redirects and retain authentication", async () => {
	const requests: { url: string; authorization: string | null }[] = [];
	const fetcher = (async (
		url: Parameters<typeof fetch>[0],
		init?: RequestInit,
	) => {
		requests.push({
			url: String(url),
			authorization: new Headers(init?.headers).get("authorization"),
		});
		return requests.length === 1
			? new Response(null, {
					status: 302,
					headers: { location: "/2.0/repositories/team/app/diffstat/commit" },
				})
			: Response.json({ values: [{ lines_added: 3 }] });
	}) as unknown as typeof fetch;
	await expect(
		forkFetch(
			"https://api.bitbucket.org/2.0/repositories/team/app/pullrequests/4/diffstat",
			{ headers: { authorization: "Bearer fixture" } },
			fetcher,
		),
	).resolves.toEqual({ values: [{ lines_added: 3 }] });
	expect(requests).toEqual([
		{
			url: "https://api.bitbucket.org/2.0/repositories/team/app/pullrequests/4/diffstat",
			authorization: "Bearer fixture",
		},
		{
			url: "https://api.bitbucket.org/2.0/repositories/team/app/diffstat/commit",
			authorization: "Bearer fixture",
		},
	]);
});

test.each([
	"https://other.example/diffstat",
	"http://api.bitbucket.org/diffstat",
	"https://user:password@api.bitbucket.org/diffstat",
])("JSON reads refuse unsafe redirect %s", async (location) => {
	let calls = 0;
	const fetcher = (async () => {
		calls++;
		return new Response(null, { status: 302, headers: { location } });
	}) as unknown as typeof fetch;
	await expect(
		forkFetch("https://api.bitbucket.org/test", {}, fetcher),
	).rejects.toMatchObject({ code: "BAD_GATEWAY" });
	expect(calls).toBe(1);
});

test("JSON redirect loops stop within the shared request budget", async () => {
	const signals: (AbortSignal | null | undefined)[] = [];
	const fetcher = (async (
		_url: Parameters<typeof fetch>[0],
		init?: RequestInit,
	) => {
		signals.push(init?.signal);
		return new Response(null, { status: 302, headers: { location: "/test" } });
	}) as unknown as typeof fetch;
	await expect(
		forkFetch("https://api.bitbucket.org/test", {}, fetcher),
	).rejects.toMatchObject({ code: "BAD_GATEWAY" });
	expect(signals).toHaveLength(4);
	expect(new Set(signals).size).toBe(1);
});

test("JSON writes do not follow redirects", async () => {
	let calls = 0;
	const fetcher = (async () => {
		calls++;
		return new Response(null, { status: 307, headers: { location: "/other" } });
	}) as unknown as typeof fetch;
	await expect(
		forkFetch("https://api.bitbucket.org/test", { method: "POST" }, fetcher),
	).rejects.toMatchObject({ code: "BAD_GATEWAY" });
	expect(calls).toBe(1);
});

test("a connection lost while reading JSON or a diff remains a recoverable service outage", async () => {
	const interrupted = (async () =>
		new Response(
			new ReadableStream({
				start(controller) {
					controller.error(new TypeError("Socket closed"));
				},
			}),
		)) as unknown as typeof fetch;
	for (const request of [
		() => forkFetch("https://api.bitbucket.org/test", {}, interrupted),
		() => forkText("https://api.bitbucket.org/test", {}, interrupted),
	]) {
		await expect(request()).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			message: "The service could not be reached",
		});
	}
});
