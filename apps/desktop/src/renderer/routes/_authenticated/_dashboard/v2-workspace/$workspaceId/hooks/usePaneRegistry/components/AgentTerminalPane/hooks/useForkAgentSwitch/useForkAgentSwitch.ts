import { useLingui } from "@lingui/react/macro";
import type { RendererContext } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback } from "react";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { acpHarnessForPreset } from "renderer/lib/acpHarness";
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
	accountSelection?: string | null;
}

export type ForkSwitchAgent = (
	target: AgentSwitchTarget,
	fallback: (target: AgentSwitchTarget) => void,
) => void;

/**
 * Switching a chat to another agent from the model picker carries the
 * conversation over natively with txcript, in the same pane, when both agents
 * support it. Otherwise upstream's handler hands it over as a context prompt.
 */
export function useForkAgentSwitch(
	workspaceId: string,
	ctx: RendererContext<PaneViewerData>,
	data: TerminalPaneData,
) {
	const { t } = useLingui();
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
					await wiring.transport
						.closeSession({ sessionId: data.acpSessionId })
						.catch(() => undefined);
				const launch = await prepareAcpLaunch.mutateAsync({
					workspaceId,
					configId: targetConfig.id,
					...(target.accountSelection !== undefined
						? { accountSelection: target.accountSelection }
						: {}),
				});
				const transfer = await prepareFromChat.mutateAsync({
					workspaceId,
					transferId: crypto.randomUUID(),
					sourceTerminalId: data.terminalId,
					sourceConfigId: ownsSaved
						? (data.acpAgentConfigId ?? source.id)
						: source.id,
					sourceSessionId: source.sessionId,
					...(ownsSaved && data.acpAccountSelection !== undefined
						? { sourceAccountSelection: data.acpAccountSelection }
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
			configs,
			capabilities,
			prepareAcpLaunch,
			prepareFromChat,
			wiring.transport,
			workspaceId,
			t,
		],
	);

	const onForkSwitchAgent = useCallback<ForkSwitchAgent>(
		(target, fallback) => {
			void switchNatively(target).then((switched) => {
				if (!switched) fallback(target);
			});
		},
		[switchNatively],
	);
	return { onForkSwitchAgent, switchInPlace: switchNatively };
}
