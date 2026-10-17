import { TRPCError } from "@trpc/server";

export function validateBrokerUrl(value: string): string {
	const url = new URL(value);
	const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
	if (
		(url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
		url.username ||
		url.password ||
		url.search ||
		url.hash
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Use an HTTPS service URL",
		});
	}
	return url.href.replace(/\/$/, "");
}
export async function forkFetch<T>(
	url: string | URL,
	init: RequestInit = {},
	fetcher: typeof fetch = fetch,
): Promise<T> {
	let response: Response;
	try {
		response = await fetcher(url, {
			...init,
			redirect: "error",
			signal: init.signal ?? AbortSignal.timeout(15_000),
		});
	} catch {
		throw new TRPCError({
			code: "BAD_GATEWAY",
			message: "The service could not be reached",
		});
	}
	if (!response.ok) {
		const code =
			response.status === 401
				? "UNAUTHORIZED"
				: response.status === 403
					? "FORBIDDEN"
					: response.status === 404
						? "NOT_FOUND"
						: response.status === 429
							? "TOO_MANY_REQUESTS"
							: response.status === 409
								? "CONFLICT"
								: response.status === 400 || response.status === 422
									? "BAD_REQUEST"
									: "BAD_GATEWAY";
		throw new TRPCError({
			code,
			message: `The service returned HTTP ${response.status}`,
			cause: { status: response.status },
		});
	}
	if (response.status === 204) return undefined as T;
	let content: string;
	try {
		content = await response.text();
	} catch {
		throw new TRPCError({
			code: "BAD_GATEWAY",
			message: "The service could not be reached",
		});
	}
	if (!content) return undefined as T;
	try {
		return JSON.parse(content) as T;
	} catch {
		throw new TRPCError({
			code: "BAD_GATEWAY",
			message: "The service returned an invalid response",
		});
	}
}
export async function forkText(
	url: string,
	headers: Record<string, string>,
	fetcher: typeof fetch = fetch,
): Promise<string> {
	const origin = new URL(url).origin;
	const signal = AbortSignal.timeout(20_000);
	for (let redirects = 0; redirects < 4; redirects++) {
		let response: Response;
		try {
			response = await fetcher(url, { headers, redirect: "manual", signal });
		} catch {
			throw new TRPCError({
				code: "BAD_GATEWAY",
				message: "The service could not be reached",
			});
		}
		if ([301, 302, 303, 307, 308].includes(response.status)) {
			const next = new URL(response.headers.get("location") ?? "", url);
			await response.body?.cancel();
			if (next.origin !== origin || next.username || next.password)
				throw new TRPCError({
					code: "BAD_GATEWAY",
					message: "Invalid diff redirect",
				});
			url = next.href;
			continue;
		}
		if (!response.ok)
			throw new TRPCError({
				code: "BAD_GATEWAY",
				message: `The service returned HTTP ${response.status}`,
			});
		const reader = response.body?.getReader(),
			chunks: Uint8Array[] = [];
		let length = 0;
		if (!reader) return "";
		for (;;) {
			const { done, value } = await reader.read().catch(() => {
				throw new TRPCError({
					code: "BAD_GATEWAY",
					message: "The service could not be reached",
				});
			});
			if (done) break;
			length += value.byteLength;
			if (length > 10 * 1024 * 1024) {
				await reader.cancel();
				throw new TRPCError({
					code: "PAYLOAD_TOO_LARGE",
					message: "Open this diff in the provider website",
				});
			}
			chunks.push(value);
		}
		return Buffer.concat(chunks).toString("utf8");
	}
	throw new TRPCError({
		code: "BAD_GATEWAY",
		message: "Too many diff redirects",
	});
}
