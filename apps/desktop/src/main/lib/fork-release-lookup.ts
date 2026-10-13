import { type ForkInstallAsset, forkInstallAsset } from "./fork-update-install";

export function createForkReleaseLookup({
	repository,
	request = fetch,
	now = Date.now,
}: {
	repository: string;
	request?: typeof fetch;
	now?: () => number;
}) {
	let cached: ForkInstallAsset | undefined;
	let etag: string | null = null;
	let retryAt = 0;
	return async (): Promise<ForkInstallAsset> => {
		if (now() < retryAt)
			throw new Error("Fork release check: GitHub rate limit; retry later");
		const headers: Record<string, string> = {
			Accept: "application/vnd.github+json",
		};
		if (etag) headers["If-None-Match"] = etag;
		const response = await request(
			`https://api.github.com/repos/${repository}/releases/latest`,
			{ headers, signal: AbortSignal.timeout(15_000) },
		);
		if (response.status === 304 && cached) return cached;
		if (
			response.status === 429 ||
			(response.status === 403 &&
				response.headers.get("x-ratelimit-remaining") === "0")
		) {
			const reset = Number(response.headers.get("x-ratelimit-reset")) * 1000;
			const retry = response.headers.get("retry-after");
			const retryDate = retry
				? Number.isFinite(Number(retry))
					? now() + Number(retry) * 1000
					: Date.parse(retry)
				: 0;
			const deadlines = [reset, retryDate].filter(
				(value) => Number.isFinite(value) && value > now(),
			);
			retryAt = Math.max(
				now() + 60_000,
				deadlines.length ? Math.max(...deadlines) : now() + 15 * 60_000,
			);
		}
		if (!response.ok)
			throw new Error(`Fork release check: HTTP ${response.status}`);
		cached = forkInstallAsset(await response.json(), repository);
		etag = response.headers.get("etag");
		retryAt = 0;
		return cached;
	};
}
