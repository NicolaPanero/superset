import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useContext } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { LocalHostServiceContext } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import { required } from "../utils/required";

export function useForkConnections(hostOverride?: string | null) {
	const context = useContext(LocalHostServiceContext);
	const hostUrl =
		hostOverride === undefined
			? (context?.activeHostUrl ?? null)
			: hostOverride;
	const client = hostUrl ? getHostServiceClientByUrl(hostUrl) : null;
	const cache = useQueryClient();
	const query = useQuery({
		queryKey: ["fork-integrations", hostUrl, "connections"],
		queryFn: () => required(client).forkConnections.list.query(),
		enabled: !!client,
		retry: false,
		staleTime: 10_000,
		refetchOnWindowFocus: true,
	});
	return {
		...query,
		isPending: !!client && query.isPending,
		hostUrl,
		client,
		connections: query.data?.connections ?? [],
		jiraConfigured: query.data?.jiraConfigured ?? false,
		refresh: () => cache.invalidateQueries({ queryKey: ["fork-integrations"] }),
	};
}
