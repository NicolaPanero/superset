import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useContext } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { LocalHostServiceContext } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";

export function useForkMcp() {
	const hostUrl = useContext(LocalHostServiceContext)?.activeHostUrl ?? null;
	const client = hostUrl ? getHostServiceClientByUrl(hostUrl) : null;
	const cache = useQueryClient();
	const queryKey = ["fork-mcp", hostUrl];
	const query = useQuery({
		queryKey,
		queryFn: () => {
			if (!client) throw new Error("fork_host_unavailable");
			return client.forkMcp.list.query();
		},
		enabled: !!client,
		retry: false,
	});
	return {
		...query,
		client,
		refresh: () => cache.invalidateQueries({ queryKey }),
	};
}

export type ForkMcpServerSummary = NonNullable<
	ReturnType<typeof useForkMcp>["data"]
>["servers"][number];
