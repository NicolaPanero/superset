import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import type { RendererContext } from "@superset/panes";
import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import { accountQuotaState } from "@superset/shared/fork-account-usage";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useMemo, useState } from "react";
import { useHostUsageQuota } from "renderer/hooks/host-service/useHostUsageQuota";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { validateAccountLaunch } from "renderer/lib/fork-account-launch";
import type { PaneViewerData, TerminalPaneData } from "../../../../../../types";
import { markChatSessionClosed } from "../../../../../../utils/closedChatSessions";
import { useChatWiring } from "../../../ChatSession/hooks/useSessionClient";
import type {
	ForkAccountChoice,
	ForkAccountSwitcher,
} from "../../../ChatSession/providers/ForkAccountSwitchProvider";

const GENERAL_WINDOWS = ["five_hour", "seven_day", "primary", "secondary"];

/**
 * The account menu of a Claude chat: every local login, with its quota, and a
 * switch that moves the conversation to the picked login in the same pane.
 */
export function useForkAccountSwitch(
	workspaceId: string,
	ctx: RendererContext<PaneViewerData>,
): ForkAccountSwitcher | undefined {
	const { t } = useLingui();
	const data = ctx.pane.data as TerminalPaneData;
	const enabled = data.agentSurface === "acp" && data.agent?.id === "claude";
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const { data: options } = workspaceTrpc.agents.accountOptions.useQuery(
		{ agent: "claude" },
		{ enabled, staleTime: 60_000 },
	);
	const quota = useHostUsageQuota(enabled ? hostUrl : null);
	const binding = useTerminalAgentBinding(workspaceId, data.terminalId);
	const { mutateAsync: moveChat } =
		workspaceTrpc.agents.moveChatToAccount.useMutation();
	const wiring = useChatWiring();
	const [switching, setSwitching] = useState(false);

	const accounts = useMemo<ForkAccountChoice[]>(
		() =>
			(options ?? []).map((option) => {
				const usage = quota.data?.find(
					(account) =>
						account.agent === "claude" &&
						account.selection === option.selection &&
						account.credentialKind === "subscription",
				);
				const tightest = usage?.windows
					.filter(
						(window) =>
							GENERAL_WINDOWS.includes(window.id) &&
							Number.isFinite(window.usedPercent),
					)
					.reduce<(typeof usage.windows)[number] | undefined>(
						(a, b) => (!a || b.usedPercent > a.usedPercent ? b : a),
						undefined,
					);
				const isSystemDefault = option.selection === null;
				return {
					selection: option.selection,
					name:
						option.alias ??
						usage?.email ??
						(isSystemDefault ? t({ message: "System default" }) : option.label),
					email: usage?.email ?? null,
					plan: usage?.plan ?? null,
					isSystemDefault,
					usage:
						accountQuotaState(usage).reason === "ready" && tightest
							? { label: tightest.label, usedPercent: tightest.usedPercent }
							: null,
				};
			}),
		[options, quota.data, t],
	);

	if (!enabled || accounts.length < 1) return undefined;
	const current =
		binding?.account?.agent === "claude"
			? binding.account.selection
			: data.acpAccountSelection;

	const onSwitch = async (selection: string | null) => {
		if (switching || selection === current) return;
		if (
			!hostUrl ||
			!(await validateAccountLaunch({
				hostUrl,
				agent: data.acpAgentConfigId ?? "claude",
				provider: "claude",
				selection,
			}))
		)
			return;
		const target = accounts.find((account) => account.selection === selection);
		const { acpSessionId, ...rest } = data;
		const restoreRecovery = acpSessionId
			? markChatSessionClosed(acpSessionId)
			: () => {};
		setSwitching(true);
		// No agent while moving, so the closed chat does not resume itself.
		ctx.actions.updateData({ ...rest, agent: undefined });
		try {
			if (acpSessionId)
				await wiring.transport.closeSession({ sessionId: acpSessionId });
			if (data.agent?.sessionId)
				await moveChat({
					agent: "claude",
					sessionId: data.agent.sessionId,
					targetSelection: selection,
				});
			ctx.actions.updateData({ ...rest, acpAccountSelection: selection });
			toast.success(
				t({ message: `Chat moved to ${target?.name ?? selection ?? ""}` }),
			);
		} catch (error) {
			restoreRecovery();
			ctx.actions.updateData(data);
			toast.error(t({ message: "Couldn't switch account" }), {
				description: errorMessage(error, t({ message: "Unknown error" })),
			});
		} finally {
			setSwitching(false);
		}
	};

	return {
		agentLabel: AGENT_IDENTITY_LABELS.claude,
		current,
		accounts,
		switching,
		onSwitch: (selection) => void onSwitch(selection),
	};
}
