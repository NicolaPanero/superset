import type { ForkConnection } from "@superset/shared/fork-integrations";
import { isForkServiceUnavailable } from "@superset/shared/fork-integrations";
import type { HostServiceClient } from "renderer/lib/host-service-client";

export interface ForkRepositoryChoice {
	fullName: string;
	cloneUrl: string;
	provider: "github" | "bitbucket";
	connectionId?: string;
}
export type ForkRepositoryCursors = Record<string, string | null>;

export function forkUniqueRepositories(items: ForkRepositoryChoice[]) {
	const unique = new Map<string, ForkRepositoryChoice>();
	for (const repo of items) {
		const key = `${repo.provider}:${repo.fullName.toLowerCase()}`;
		if (!unique.has(key)) unique.set(key, repo);
	}
	return [...unique.values()];
}

export async function forkListRepositories(
	client: HostServiceClient,
	accounts: ForkConnection[],
	cursors: ForkRepositoryCursors,
	supported: boolean,
	cached: ForkRepositoryChoice[] = [],
) {
	const results = await Promise.all(
		accounts.map(async (account) => {
			if (cursors[account.id] === null)
				return {
					items: [] as ForkRepositoryChoice[],
					next: null,
					error: false,
					id: account.id,
				};
			try {
				if (!supported) {
					const items = await client.project.listGitHubRepositories.query();
					return {
						items: items.map((repo) => ({
							...repo,
							provider: "github" as const,
							connectionId: undefined,
						})),
						next: null,
						error: false,
						id: account.id,
					};
				}
				const page = await client.forkScm.repositories.query({
					connectionId: account.id,
					cursor: cursors[account.id] ?? undefined,
				});
				return {
					items: page.items as ForkRepositoryChoice[],
					next: page.nextCursor,
					error: false,
					id: account.id,
				};
			} catch (error) {
				const unavailable = isForkServiceUnavailable(error);
				return {
					items: unavailable
						? cached.filter(
								(repo) =>
									repo.connectionId === account.id ||
									(!supported && !repo.connectionId),
							)
						: [],
					unavailable,
					next: null,
					error: true,
					id: account.id,
				};
			}
		}),
	);
	return {
		items: results.flatMap((r) => r.items),
		unavailable: results.filter((r) => r.unavailable).map((r) => r.id),
		errors: results.filter((r) => r.error).map((r) => r.id),
		nextCursors: Object.fromEntries(results.map((r) => [r.id, r.next])),
	};
}
