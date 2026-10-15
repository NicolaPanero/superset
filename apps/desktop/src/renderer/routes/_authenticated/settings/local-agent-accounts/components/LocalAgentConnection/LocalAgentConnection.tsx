import type { HostAgentConfig } from "@superset/host-service/settings";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { V2_AGENT_CONFIGS_QUERY_KEY } from "renderer/hooks/useV2AgentConfigs";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getForkAgentSnapshotCommand } from "renderer/lib/fork-agent-snapshot";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { ForkAgentSetup } from "../ForkAgentSetup";
export function LocalAgentConnection({
	hostUrl,
	config,
}: {
	hostUrl: string | null;
	config: HostAgentConfig;
}) {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const collections = useCollections();
	const { activeHostUrl } = useLocalHostService();
	const setupAgent = electronTrpc.settings.setupAgent.useMutation();
	return (
		<ForkAgentSetup
			config={config}
			hostUrl={hostUrl}
			allowLocalLogin={hostUrl === activeHostUrl}
			onAdvanced={() => {
				void navigate({
					to: "/settings/agents/$agentId",
					params: { agentId: config.id },
				});
			}}
			onChanged={(updated) => {
				const queryKey = [...V2_AGENT_CONFIGS_QUERY_KEY, hostUrl];
				queryClient.setQueryData<HostAgentConfig[]>(queryKey, (current) =>
					current?.map((row) => (row.id === updated.id ? updated : row)),
				);
				void queryClient.invalidateQueries({ queryKey });
				if (hostUrl !== activeHostUrl) return;
				const command = getForkAgentSnapshotCommand(updated);
				for (const preset of collections.v2TerminalPresets.values())
					if (
						preset.agentId === updated.id ||
						preset.agentId === updated.presetId
					)
						collections.v2TerminalPresets.update(preset.id, (draft) => {
							draft.commands = [command];
						});
				if (hostUrl === activeHostUrl)
					setupAgent.mutate({ agentId: updated.presetId });
			}}
		/>
	);
}
