import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useMemo } from "react";
import {
	getHostServiceClientByUrl,
	hostServiceQueryRetry,
} from "renderer/lib/host-service-client";
import { useWorkspaceEvent } from "../useWorkspaceEvent";
import { useWorkspaceHostUrl } from "../useWorkspaceHostUrl";

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

	const { data: status } = useQuery({
		queryKey,
		enabled: enabled && Boolean(workspaceId) && Boolean(hostUrl),
		queryFn: async () => {
			if (!hostUrl) return null;
			const client = getHostServiceClientByUrl(hostUrl);
			const base = await client.git.getBaseBranch.query({
				workspaceId,
				inferOrigin: true,
			});
			return client.git.getStatus.query({
				workspaceId,
				baseBranch: base.needsSelection
					? "HEAD"
					: (base.baseBranch ?? undefined),
				priority: "background",
			});
		},
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

	return useMemo<DiffStats | null>(() => {
		if (!status) return null;

		const byPath = new Map<
			string,
			{ additions: number | null; deletions: number | null }
		>();
		for (const file of status.againstBase) byPath.set(file.path, file);
		for (const file of status.staged) byPath.set(file.path, file);
		for (const file of status.unstaged) byPath.set(file.path, file);

		let additions = 0;
		let deletions = 0;
		for (const file of byPath.values()) {
			additions += file.additions ?? 0;
			deletions += file.deletions ?? 0;
		}
		return { additions, deletions };
	}, [status]);
}
