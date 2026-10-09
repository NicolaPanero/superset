import type { AppRouter } from "@superset/host-service";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useCallback, useEffect, useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

type RouterOutputs = inferRouterOutputs<AppRouter>;
export type UsageAccount = RouterOutputs["usage"]["quota"][number];
export type UsageQuotaWindow = UsageAccount["windows"][number];

export const HOST_USAGE_QUOTA_QUERY_KEY = ["host-usage-quota"] as const;
const USAGE_REFETCH_INTERVAL_MS = 5 * 60_000;
const USAGE_CACHE_MS = 24 * 60 * 60_000;
const recoveries = new Map<string, number>();

/**
 * Subscription quota for every AI CLI login on the given host. The host
 * caches upstream responses for ~5 min (faster polling gets the endpoint
 * 429-blacklisted), so the poll here mostly re-reads that cache; `refresh`
 * bypasses it for an explicit user-initiated update.
 */
export function useHostUsageQuota(hostUrl: string | null) {
	const queryClient = useQueryClient();
	const queryKey = useMemo(
		() => [...HOST_USAGE_QUOTA_QUERY_KEY, hostUrl] as const,
		[hostUrl],
	);

	const query = useQuery({
		queryKey,
		enabled: !!hostUrl,
		queryFn: () => {
			if (!hostUrl) return [] as UsageAccount[];
			return getHostServiceClientByUrl(hostUrl).usage.quota.query();
		},
		refetchInterval: USAGE_REFETCH_INTERVAL_MS,
		staleTime: USAGE_REFETCH_INTERVAL_MS,
		// Keep the last accounts visible when returning after a long absence.
		gcTime: USAGE_CACHE_MS,
	});

	useEffect(() => {
		if (!hostUrl || !query.data || document.visibilityState === "hidden")
			return;
		const candidates = query.data.filter(
			(account) =>
				(account.agent === "claude" || account.agent === "codex") &&
				(account.status === "token_stale" ||
					account.status === "token_expired"),
		);
		for (const [key, at] of recoveries)
			if (Date.now() - at >= USAGE_REFETCH_INTERVAL_MS) recoveries.delete(key);
		const pending = candidates.filter((account) => {
			const key = `${hostUrl}:${account.agent}:${account.selection ?? ""}`;
			if (recoveries.has(key) || recoveries.size >= 128) return false;
			recoveries.set(key, Date.now());
			return true;
		});
		if (!pending.length) return;
		let cancelled = false;
		const client = getHostServiceClientByUrl(hostUrl);
		Promise.all(
			pending.map((account) =>
				client.usage.verifyAccount
					.mutate({
						agent: account.agent as "claude" | "codex",
						selection: account.selection,
					})
					.catch(() => null),
			),
		)
			.then(async (results) => {
				if (
					cancelled ||
					!results.some((result) => result?.status === "checked")
				)
					return;
				const fresh = await client.usage.quota.query({ forceRefresh: true });
				if (!cancelled) queryClient.setQueryData(queryKey, fresh);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [hostUrl, query.data, queryClient, queryKey]);

	const refresh = useCallback(async () => {
		if (!hostUrl) return;
		const fresh = await getHostServiceClientByUrl(hostUrl).usage.quota.query({
			forceRefresh: true,
		});
		queryClient.setQueryData(queryKey, fresh);
	}, [hostUrl, queryClient, queryKey]);

	return { ...query, refresh };
}
