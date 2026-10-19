import { useQuery } from "@tanstack/react-query";
import { useForkConnections } from "../../../../hooks/useForkConnections";
import { required } from "../../../../utils/required";

export function useForkJiraBoardContext(
	connectionId: string,
	boardId?: string,
	project?: string,
) {
	const { client, hostUrl, data } = useForkConnections();
	const supported = (data?.version ?? 0) >= 5;
	const query = useQuery({
		queryKey: [
			"fork-integrations",
			hostUrl,
			"board-context",
			connectionId,
			boardId,
			project,
		],
		queryFn: () =>
			required(client).forkTasks.boardContext.query({
				connectionId,
				boardId: boardId ? Number(boardId) : undefined,
				project,
			}),
		enabled: supported && !!client && !!connectionId,
		staleTime: 60_000,
		retry: false,
		networkMode: "always",
	});
	return { ...query, supported };
}
