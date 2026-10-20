import type { ChatRouter } from "@superset/chat-runtime";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { useMemo } from "react";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { getHostServiceHeaders } from "renderer/lib/host-service-auth";
import { useAgentSessionTitles } from "renderer/routes/_authenticated/_dashboard/components/AgentSessionPicker/hooks/useAgentSessionTitles";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { DashboardSidebarRunningAgent } from "../../../../../../hooks/useDashboardSidebarWorkspaceRunningAgents";
import { resolveAgentSessionTitles } from "./utils/resolveAgentSessionTitles";

export function useDashboardSidebarAgentTitles(
	workspaceId: string,
	agents: DashboardSidebarRunningAgent[],
) {
	const collections = useCollections();
	const { data: rows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ workspace: collections.v2WorkspaceLocalState })
				.where(({ workspace }) => eq(workspace.workspaceId, workspaceId)),
		[collections, workspaceId],
	);
	const { titles: terminalTitles } = useAgentSessionTitles({
		workspaceId,
		enabled: true,
		open: true,
	});
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const client = useMemo(
		() =>
			createTRPCClient<ChatRouter>({
				links: [
					httpBatchLink({
						url: `${hostUrl}/chat-v3/trpc`,
						headers: () => getHostServiceHeaders(hostUrl ?? ""),
					}),
				],
			}),
		[hostUrl],
	);
	const { data: sessions = [] } = useQuery({
		queryKey: ["chat-v3", hostUrl, "listSessions", workspaceId],
		queryFn: ({ signal }) =>
			client.listSessions.query({ workspaceId }, { signal }),
		enabled: Boolean(hostUrl),
		staleTime: 5_000,
		refetchInterval: 2_000,
		refetchOnWindowFocus: false,
		retry: false,
	});
	const workspace = rows.find((row) => row.workspaceId === workspaceId);
	return useMemo(
		() =>
			resolveAgentSessionTitles({
				layouts: [workspace?.paneLayout, workspace?.rightPaneLayout],
				terminalTitles,
				sessions,
				agents,
			}),
		[workspace, terminalTitles, sessions, agents],
	);
}
