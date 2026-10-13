import { expect, mock, test } from "bun:test";
import { createForkReleaseLookup } from "./fork-release-lookup";

const repository = "NicolaPanero/superset";
function body(tag = "desktop-v1.37.0-fork.aaaaaaa") {
	return {
		tag_name: tag,
		assets: [
			{
				name: "Superset-fork-arm64.zip",
				browser_download_url: `https://github.com/${repository}/releases/download/${tag}/Superset-fork-arm64.zip`,
				digest: `sha256:${"a".repeat(64)}`,
			},
		],
	};
}
test("conditional checks retain a verified asset on HTTP 304 and detect a changed release", async () => {
	const responses = [
		Response.json(body(), { headers: { etag: '"first"' } }),
		new Response(null, { status: 304 }),
		Response.json(body("desktop-v1.37.0-fork.bbbbbbb"), {
			headers: { etag: '"second"' },
		}),
	];
	const request = mock(
		async (_url: string | URL | Request, _options?: RequestInit) => {
			const response = responses.shift();
			if (!response) throw new Error("Unexpected request");
			return response;
		},
	);
	const lookup = createForkReleaseLookup({
		repository,
		request: request as unknown as typeof fetch,
	});
	const first = await lookup();
	expect(await lookup()).toEqual(first);
	expect(request.mock.calls[1]?.[1]?.headers).toMatchObject({
		"If-None-Match": '"first"',
	});
	expect((await lookup()).tag).toBe("desktop-v1.37.0-fork.bbbbbbb");
});
test.each([
	403, 429,
])("rate limit HTTP %s respects GitHub's deadline without repeated requests", async (status) => {
	let clock = 1_000_000;
	const request = mock(
		async () =>
			new Response(null, {
				status,
				headers: {
					"retry-after": "120",
					"x-ratelimit-reset": "1300",
					"x-ratelimit-remaining": "0",
				},
			}),
	);
	const lookup = createForkReleaseLookup({
		repository,
		request: request as unknown as typeof fetch,
		now: () => clock,
	});
	await expect(lookup()).rejects.toThrow(`HTTP ${status}`);
	clock += 120_000;
	await expect(lookup()).rejects.toThrow("rate limit");
	expect(request).toHaveBeenCalledTimes(1);
	clock = 1_300_000;
	request.mockResolvedValue(Response.json(body()));
	expect((await lookup()).tag).toBe(body().tag_name);
	expect(request).toHaveBeenCalledTimes(2);
});
test("an invalid archive never enters the cache, and a transient failure can retry", async () => {
	const request = mock(async () =>
		Response.json({ tag_name: body().tag_name, assets: [] }),
	);
	const lookup = createForkReleaseLookup({
		repository,
		request: request as unknown as typeof fetch,
	});
	await expect(lookup()).rejects.toThrow("checksum");
	request.mockResolvedValue(new Response(null, { status: 503 }));
	await expect(lookup()).rejects.toThrow("HTTP 503");
	request.mockResolvedValue(Response.json(body()));
	expect((await lookup()).tag).toBe(body().tag_name);
});
