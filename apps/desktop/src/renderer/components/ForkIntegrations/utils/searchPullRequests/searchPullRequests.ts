import type { HostServiceClient } from "renderer/lib/host-service-client";

type SearchPage = Awaited<
	ReturnType<HostServiceClient["forkScm"]["searchPullRequests"]["query"]>
>;

export function forkKeepUnavailablePullRequests(
	next: SearchPage,
	previous?: SearchPage,
): SearchPage {
	if (!previous) return next;
	const unavailable = new Set(
		next.warnings.filter((w) => w.unavailable).map((w) => w.projectId),
	);
	const cached = previous.pullRequests.filter(
		(pr) =>
			unavailable.has(pr.projectId) &&
			!next.pullRequests.some(
				(row) => row.projectId === pr.projectId && row.prNumber === pr.prNumber,
			),
	);
	if (!cached.length) return next;
	return {
		...next,
		totalCount: Math.max(next.totalCount + cached.length, previous.totalCount),
		pullRequests: [...next.pullRequests, ...cached].sort((a, b) =>
			(b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
		),
	};
}

type SearchInput = Parameters<
	HostServiceClient["workspaceCreation"]["searchPullRequests"]["query"]
>[0];

/** PR search across providers; `previous` is the cached page for the same query. */
export function forkPullRequestSearch(
	client: HostServiceClient,
	previous?: unknown,
) {
	return {
		query: (input: SearchInput) =>
			searchPullRequests(client, input, previous as SearchPage | undefined),
	};
}

const SUPPORT_TTL_MS = 60_000;
const support = new WeakMap<
	HostServiceClient,
	{ at: number; supported: Promise<boolean> }
>();

/** Hosts answer the same until they update, so one probe serves a minute of searches. */
export function forkUnifiedSearchSupported(
	client: HostServiceClient,
	now = Date.now(),
): Promise<boolean> {
	const cached = support.get(client);
	if (cached && now - cached.at < SUPPORT_TTL_MS) return cached.supported;
	const supported = client.forkConnections.list
		.query()
		.then((result) => result.version >= 2)
		.catch((error) => {
			support.delete(client);
			if (
				error &&
				typeof error === "object" &&
				"data" in error &&
				(error.data as { code?: string } | undefined)?.code === "NOT_FOUND"
			)
				return false;
			throw error;
		});
	support.set(client, { at: now, supported });
	return supported;
}

async function searchPullRequests(
	client: HostServiceClient,
	input: SearchInput,
	previous?: SearchPage,
) {
	const supported = await forkUnifiedSearchSupported(client);
	if (supported)
		return forkKeepUnavailablePullRequests(
			await client.forkScm.searchPullRequests.query(input),
			previous,
		);
	const result = await client.workspaceCreation.searchPullRequests.query(input);
	return {
		...result,
		warnings: [],
		pullRequests: result.pullRequests.map((pr) => ({
			...pr,
			provider: "github" as const,
			repository: undefined,
			connectionId: undefined,
		})),
	};
}
