import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useMemo } from "react";
import {
	getHostServiceClientByUrl,
	hostServiceQueryRetry,
} from "renderer/lib/host-service-client";
import { useWorkspaceEvent } from "../useWorkspaceEvent";
import { useWorkspaceHostUrl } from "../useWorkspaceHostUrl";
import { forkFetchDiffStats } from "./utils/fork-fetch-diff-stats";

export interface DiffStats {
	additions: number;
	deletions: number;
}

export function getDiffStatsQueryKey(
	hostUrl: string | null,
	workspaceId: string,
) {
	return ["diff-stats", hostUrl, workspaceId] as const;
}

export function useDiffStats(
	workspaceId: string,
	options?: { enabled?: boolean },
): DiffStats | null {
	const enabled = options?.enabled ?? true;
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const queryClient = useQueryClient();
	const queryKey = useMemo(
		() => getDiffStatsQueryKey(hostUrl, workspaceId),
		[hostUrl, workspaceId],
	);

	const { data: stats } = useQuery({
		queryKey,
		enabled: enabled && Boolean(workspaceId) && Boolean(hostUrl),
		queryFn: () =>
			hostUrl
				? forkFetchDiffStats(getHostServiceClientByUrl(hostUrl), workspaceId)
				: null,
		retry: (failureCount, error) =>
			error instanceof TRPCClientError && error.data?.code === "TIMEOUT"
				? failureCount < 2
				: hostServiceQueryRetry(failureCount, error),
		refetchOnWindowFocus: false,
		staleTime: Number.POSITIVE_INFINITY,
	});

	const invalidate = useCallback(() => {
		void queryClient.invalidateQueries({ queryKey });
	}, [queryClient, queryKey]);

	// Stays subscribed while disabled: invalidation marks the cached stats
	// stale so they refetch when the query is re-enabled (staleTime is
	// Infinity, so a gated subscription would freeze counts).
	useWorkspaceEvent(
		"git:changed",
		workspaceId,
		invalidate,
		Boolean(workspaceId) && Boolean(hostUrl),
	);

	return stats ?? null;
}
