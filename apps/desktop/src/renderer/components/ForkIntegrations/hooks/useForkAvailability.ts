import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { required } from "../utils/required";
import { useForkConnections } from "./useForkConnections";

export function useForkAvailability() {
	const { client, hostUrl, data } = useForkConnections();
	const cache = useQueryClient();
	const previous = useRef({ hostUrl, ids: [] as string[] });
	const query = useQuery({
		queryKey: ["fork-integrations", hostUrl, "availability"],
		queryFn: () => required(client).forkConnections.availability.query(),
		enabled: !!client && (data?.version ?? 0) >= 3,
		networkMode: "always",
		retry: false,
		refetchInterval: 10_000,
	});
	useEffect(() => {
		if (!query.data) return;
		const ids = query.data.map((status) => status.connectionId);
		if (
			previous.current.hostUrl === hostUrl &&
			previous.current.ids.some((id) => !ids.includes(id))
		)
			void cache.invalidateQueries({
				predicate: ({ queryKey }) =>
					(queryKey[0] === "fork-integrations" &&
						queryKey[1] === hostUrl &&
						queryKey[2] !== "availability") ||
					(queryKey[0] === "pullRequests" && queryKey.includes(hostUrl)),
			});
		previous.current = { hostUrl, ids };
	}, [cache, hostUrl, query.data]);
	return query;
}
