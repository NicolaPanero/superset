import { useLingui } from "@lingui/react/macro";
import { acpHarnessForPreset } from "@superset/chat/core";
import type { RendererContext } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback } from "react";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import type { PaneViewerData, TerminalPaneData } from "../../../../../../types";
import { useChatWiring } from "../../../ChatSession/hooks/useSessionClient";

export interface AgentSwitchTarget {
	presetId: string;
	label: string;
	model: { id: string; label: string } | null;
	modeId: string | undefined;
	handoffPrompt: string | null;
	/** Fork-only: the exact config and account, from the handoff dialog. */
	configId?: string;
	transferId?: string;
	accountSelection?: string | null;
}

/** Converts an explicit handoff in the current pane; failure leaves the source resumable. */
export function useForkAgentSwitch(
	workspaceId: string,
	ctx: RendererContext<PaneViewerData>,
	data: TerminalPaneData,
) {
	const { t } = useLingui();
	const binding = useTerminalAgentBinding(workspaceId, data.terminalId);
	const sourceSelection = binding?.account
		? binding.account.selection
		: data.acpAccountSelection;
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const { data: configs = [] } = useV2AgentConfigs(hostUrl);
	const { data: capabilities } =
		workspaceTrpc.sessionTransfer.capabilities.useQuery(undefined, {
			retry: false,
			staleTime: 60_000,
		});
	const wiring = useChatWiring();
	const prepareAcpLaunch = workspaceTrpc.agents.prepareAcpLaunch.useMutation();
	const prepareFromChat =
		workspaceTrpc.sessionTransfer.prepareFromChat.useMutation();

	const switchNatively = useCallback(
		async (target: AgentSwitchTarget): Promise<boolean> => {
			const source = data.agent;
			const verified = (preset: string | undefined) =>
				Boolean(
					preset &&
						capabilities?.adapters.find((adapter) => adapter.agent === preset)
							?.verified,
				);
			const targetConfig = configs.find(
				(config) =>
					(target.configId
						? config.id === target.configId
						: config.presetId === target.presetId) &&
					acpHarnessForPreset(config.presetId),
			);
			if (
				!source?.sessionId ||
				!capabilities?.nativeAvailable ||
				!verified(source.id) ||
				!verified(target.presetId) ||
				!targetConfig?.resumeArgs?.length
			)
				return false;
			const ownsSaved =
				configs.find((config) => config.id === data.acpAgentConfigId)
					?.presetId === source.id;
			const {
				acpSessionId: _session,
				chatModelId: _model,
				chatModelLabel: _modelLabel,
				chatModeId: _mode,
				pendingPrompt: _prompt,
				pendingAttachments: _attachments,
				...rest
			} = data;
			ctx.actions.setTitle(target.label);
			// No agent while converting, so the closed chat does not resume itself.
			ctx.actions.updateData({ ...rest, agent: undefined });
			try {
				if (data.acpSessionId)
					await wiring.transport.closeSession({ sessionId: data.acpSessionId });
				const launch = await prepareAcpLaunch.mutateAsync({
					workspaceId,
					configId: targetConfig.id,
					...(target.accountSelection !== undefined
						? { accountSelection: target.accountSelection }
						: {}),
				});
				const transfer = await prepareFromChat.mutateAsync({
					workspaceId,
					transferId: target.transferId ?? crypto.randomUUID(),
					sourceTerminalId: data.terminalId,
					sourceConfigId: ownsSaved
						? (data.acpAgentConfigId ?? source.id)
						: source.id,
					sourceSessionId: source.sessionId,
					...(sourceSelection !== undefined
						? { sourceAccountSelection: sourceSelection }
						: {}),
					targetConfigId: launch.agentConfigId,
					...(launch.accountSelection !== undefined
						? { targetAccountSelection: launch.accountSelection }
						: {}),
					targetTerminalId: data.terminalId,
				});
				const modelId = target.model?.id ?? launch.defaultModelId;
				ctx.actions.updateData({
					...rest,
					agent: { id: target.presetId, sessionId: transfer.targetSessionId },
					acpAgentConfigId: launch.agentConfigId,
					acpAccountSelection: launch.accountSelection,
					...(modelId ? { chatModelId: modelId } : {}),
					...(target.model ? { chatModelLabel: target.model.label } : {}),
					...(target.modeId ? { chatModeId: target.modeId } : {}),
				});
				toast.success(t({ message: "Native handoff complete" }), {
					description: `${source.id} → ${target.label}`,
				});
				return true;
			} catch (error) {
				console.warn("[acp-chat] native agent switch failed", error);
				ctx.actions.updateData(data);
				return false;
			}
		},
		[
			ctx,
			data,
			sourceSelection,
			configs,
			capabilities,
			prepareAcpLaunch,
			prepareFromChat,
			wiring.transport,
			workspaceId,
			t,
		],
	);

	return { switchInPlace: switchNatively };
}
