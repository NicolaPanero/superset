import type { HostAgentConfig } from "@superset/host-service/settings";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export function useForkAgentSetup(
	hostUrl: string | null,
	config: HostAgentConfig,
	clientForHost = getHostServiceClientByUrl,
) {
	const query = useQuery({
		queryKey: [
			"fork-agent-setup",
			hostUrl,
			config.id,
			config.command,
			config.args,
			Object.keys(config.env).sort(),
		],
		enabled: !!hostUrl,
		queryFn: () =>
			clientForHost(hostUrl as string).settings.forkAgentSetup.inspect.query({
				configId: config.id,
			}),
		retry: false,
		throwOnError: false,
		staleTime: 60000,
		gcTime: 60000,
	});
	const apply = useMutation({
		retry: false,
		throwOnError: false,
		gcTime: 0,
		mutationFn: async (api?: { key: string; model: string }) => {
			if (!hostUrl || !query.data?.command)
				throw new Error("agent_setup_unavailable");
			if (
				api &&
				config.presetId === "cursor-agent" &&
				!query.data.cursorApiKeySupported
			)
				throw new Error("agent_setup_unavailable");
			await clientForHost(hostUrl).settings.forkAgentSetup.configure.mutate({
				configId: config.id,
				expectedCommand: query.data.command,
				expectedRevision: query.data.revision,
				...(config.presetId === "cursor-agent"
					? { cursorApiKey: api?.key }
					: { api }),
			});
			const rows =
				await clientForHost(hostUrl).settings.agentConfigs.list.query();
			return rows.find((row) => row.id === config.id);
		},
		onSuccess: async () => {
			await query.refetch();
		},
	});
	return { ...query, apply };
}
