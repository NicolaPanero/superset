import { createHash } from "node:crypto";

interface FetchResponse {
	headers: { get(name: string): string | null; has(name: string): boolean };
	status: number;
	statusText: string;
	ok: boolean;
	json(): Promise<unknown>;
	arrayBuffer(): Promise<ArrayBuffer>;
	clone(): FetchResponse;
}
const TTL = 5 * 60_000;
const entries = new Map<
	string,
	{ until: number; credentialKey: string; promise: Promise<FetchResponse> }
>();

export function retryAfterMs(value: string | null, now = Date.now()) {
	if (!value) return TTL;
	const seconds = Number(value);
	return Number.isFinite(seconds)
		? Math.max(0, seconds * 1000)
		: Math.max(TTL, Date.parse(value) - now || TTL);
}

export async function quotaFetch(
	url: string,
	init: RequestInit,
	identity?: string,
): Promise<FetchResponse> {
	const credentialKey = createHash("sha256")
		.update(JSON.stringify(init.headers))
		.digest("hex");
	const key = createHash("sha256")
		.update(url + (identity ?? credentialKey))
		.digest("hex");
	const now = Date.now();
	const existing = entries.get(key);
	if (existing && now < existing.until) {
		const response = await existing.promise;
		if (existing.credentialKey === credentialKey || response.status === 429)
			return response.clone();
	}
	for (const [id, entry] of entries) if (now >= entry.until) entries.delete(id);
	if (entries.size >= 384) throw new Error("quota_request_capacity");
	const entry = {
		until: now + TTL,
		credentialKey,
		promise: Promise.resolve(new Response()),
	};
	entry.promise = fetch(url, init).then(async (response) => {
		if (response.status === 429)
			entry.until =
				now +
				Math.max(TTL, retryAfterMs(response.headers.get("retry-after"), now));
		const headers = new Headers(response.headers);
		headers.set("x-superset-quota-sampled-at", String(now));
		if (response.status === 429)
			headers.set("x-superset-quota-retry-at", String(entry.until));
		return new Response(await response.arrayBuffer(), {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	});
	entries.set(key, entry);
	return (await entry.promise).clone();
}

export function quotaResponseTiming(response: FetchResponse) {
	return {
		fetchedAt: new Date(
			Number(response.headers.get("x-superset-quota-sampled-at")) || Date.now(),
		),
		...(response.headers.has("x-superset-quota-retry-at")
			? {
					retryAt: new Date(
						Number(response.headers.get("x-superset-quota-retry-at")),
					),
				}
			: {}),
	};
}
