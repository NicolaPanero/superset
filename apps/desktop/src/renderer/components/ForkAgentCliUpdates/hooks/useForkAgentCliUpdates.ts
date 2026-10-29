import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForkConnections } from "../../ForkIntegrations/hooks/useForkConnections";

const SIX_HOURS = 6 * 60 * 60 * 1000;
const FIRST_VERSION = 10;

function required<T>(value: T | null): T {
	if (value === null) throw new Error("The host is not connected");
	return value;
}

/** The host decides when the network is read (once a day); this only asks. */
export function useForkAgentCliUpdates() {
	const { client, hostUrl, data } = useForkConnections();
	const cache = useQueryClient();
	const supported = (data?.version ?? 0) >= FIRST_VERSION;
	const key = ["fork-agent-cli", hostUrl];
	const status = useQuery({
		queryKey: key,
		queryFn: () => required(client).forkAgentCli.status.query(),
		enabled: !!client && supported,
		retry: false,
		staleTime: 60 * 60 * 1000,
		refetchInterval: SIX_HOURS,
		refetchOnWindowFocus: true,
	});
	const checkNow = useMutation({
		mutationFn: () =>
			required(client).forkAgentCli.status.query({ force: true }),
		onSuccess: (result) => cache.setQueryData(key, result),
	});
	const setEnabled = useMutation({
		mutationFn: (enabled: boolean) =>
			required(client).forkAgentCli.setEnabled.mutate({ enabled }),
		onSuccess: () => cache.invalidateQueries({ queryKey: key }),
	});
	const snooze = useMutation({
		mutationFn: () => required(client).forkAgentCli.snooze.mutate(),
		onSuccess: () => cache.invalidateQueries({ queryKey: key }),
	});
	const update = useMutation({
		mutationFn: (agent: "claude" | "codex") =>
			required(client).forkAgentCli.update.mutate({ agent }),
		onSettled: () => cache.invalidateQueries({ queryKey: key }),
	});
	return { supported, status, checkNow, setEnabled, snooze, update };
}
