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

async function searchPullRequests(
	client: HostServiceClient,
	input: SearchInput,
	previous?: SearchPage,
) {
	let supported = false;
	try {
		supported = (await client.forkConnections.list.query()).version >= 2;
	} catch (error) {
		if (
			!(
				error &&
				typeof error === "object" &&
				"data" in error &&
				(error.data as { code?: string } | undefined)?.code === "NOT_FOUND"
			)
		)
			throw error;
	}
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
