import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useState } from "react";

type Scope = { workspaceId: string } | { projectId: string };

/**
 * Local agent chats for a project. The list without first prompts arrives in
 * under a second; the previews replace it when their slower scan finishes.
 */
export function useForkExternalSessions(scope: Scope, enabled = true) {
	const utils = workspaceTrpc.useUtils();
	const options = { enabled, retry: false, staleTime: 30_000 } as const;
	const quick = workspaceTrpc.sessionTransfer.externalSessions.useQuery(
		{ ...scope, preview: false },
		options,
	);
	// Started after the quick list: the batch link would otherwise hold the
	// quick answer until the slow one is ready, and the scans compete for CPU.
	const full = workspaceTrpc.sessionTransfer.externalSessions.useQuery(scope, {
		...options,
		enabled: enabled && (quick.isFetched || quick.isError),
	});
	const [refreshing, setRefreshing] = useState(false);
	const scopeKey = JSON.stringify(scope);
	// biome-ignore lint/correctness/useExhaustiveDependencies: scopeKey stands for scope
	const refetch = useCallback(async () => {
		setRefreshing(true);
		try {
			const fresh = await utils.sessionTransfer.externalSessions.fetch(
				{ ...scope, refresh: true },
				{ staleTime: 0 },
			);
			utils.sessionTransfer.externalSessions.setData(scope, fresh);
		} finally {
			setRefreshing(false);
		}
	}, [utils, scopeKey]);
	return {
		data: full.data ?? quick.data,
		isPending: quick.isPending && full.isPending,
		isFetching: refreshing || quick.isFetching || full.isFetching,
		loadingPreviews: !full.data && !!quick.data && full.isFetching,
		error: full.data ? null : (full.error ?? (quick.data ? null : quick.error)),
		refetch,
	};
}
