import type { ForkConnection } from "@superset/shared/fork-integrations";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { required } from "../../utils/required";
import { useForkConnections } from "../useForkConnections";

export function useForkGithubDiscovery(connection: ForkConnection | undefined) {
	const { client, hostUrl } = useForkConnections();
	const cache = useQueryClient();
	const id = connection?.id;
	const enabled =
		!!client &&
		connection?.provider === "github" &&
		connection.mode === "system" &&
		connection.enabled &&
		connection.state !== "connected";
	const query = useQuery({
		queryKey: ["fork-github-discovery", hostUrl, id],
		enabled,
		networkMode: "always",
		retry: false,
		staleTime: 30_000,
		refetchOnMount: "always",
		refetchOnWindowFocus: false,
		refetchOnReconnect: true,
		queryFn: async () => {
			const result = await required(client).forkConnections.verify.mutate({
				id: required(id),
			});
			void cache.invalidateQueries({
				queryKey: ["fork-integrations", hostUrl, "connections"],
			});
			return result;
		},
	});
	const { refetch } = query;
	useEffect(() => {
		if (!enabled) return;
		const check = () => {
			void refetch({ cancelRefetch: false });
		};
		window.addEventListener("focus", check);
		return () => window.removeEventListener("focus", check);
	}, [enabled, refetch]);
	return query;
}
