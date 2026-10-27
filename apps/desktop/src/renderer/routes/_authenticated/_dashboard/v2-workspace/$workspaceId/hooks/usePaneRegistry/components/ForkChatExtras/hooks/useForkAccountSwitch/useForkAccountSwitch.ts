import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import type { RendererContext } from "@superset/panes";
import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import { accountQuotaState } from "@superset/shared/fork-account-usage";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { TRPCClientError } from "@trpc/client";
import { useMemo, useRef, useState } from "react";
import { useHostUsageQuota } from "renderer/hooks/host-service/useHostUsageQuota";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { forkAccountLabel } from "renderer/lib/fork-account-label";
import { validateAccountLaunch } from "renderer/lib/fork-account-launch";
import { visibleForkAccountOptions } from "renderer/lib/fork-account-visibility";
import { useForkCliOptions } from "renderer/stores/fork-cli-options";
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
	const showCliOptions = useForkCliOptions();
	const { t } = useLingui();
	const data = ctx.pane.data as TerminalPaneData;
	const enabled = data.agentSurface === "acp" && data.agent?.id === "claude";
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const { data: options } = workspaceTrpc.agents.accountOptions.useQuery(
		{ agent: "claude", isolated: true },
		{ enabled, staleTime: 60_000 },
	);
	const quota = useHostUsageQuota(enabled ? hostUrl : null);
	const binding = useTerminalAgentBinding(workspaceId, data.terminalId);
	const { mutateAsync: moveChat } =
		workspaceTrpc.agents.moveChatToAccount.useMutation();
	const { mutateAsync: switchChat } =
		workspaceTrpc.agents.switchChatAccount.useMutation();
	const recovery = workspaceTrpc.agents.quotaRecovery.useQuery(
		{ workspaceId, terminalId: data.terminalId, agent: "claude" },
		{ enabled, retry: false, staleTime: 60_000 },
	);
	const wiring = useChatWiring();
	const [switching, setSwitching] = useState(false);
	const switchInFlight = useRef(false);

	const accounts = useMemo<ForkAccountChoice[]>(
		() =>
			visibleForkAccountOptions(options ?? [], showCliOptions).map((option) => {
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
					name: forkAccountLabel(
						option,
						usage?.email,
						t({ message: "CLI login" }),
					),
					email: usage?.email ?? null,
					plan: usage?.plan ?? null,
					isSystemDefault,
					usage:
						accountQuotaState(usage).reason === "ready" && tightest
							? { label: tightest.label, usedPercent: tightest.usedPercent }
							: null,
				};
			}),
		[options, quota.data, t, showCliOptions],
	);

	if (!enabled || accounts.length < 1) return undefined;
	const current =
		binding?.account?.agent === "claude"
			? binding.account.selection
			: data.acpAccountSelection;
	const nativeSessionId = binding?.agentSessionId ?? data.agent?.sessionId;

	const canStop = recovery.data?.manualAccountSwitch === true;
	const onSwitch = async (selection: string | null): Promise<boolean> => {
		if (
			switchInFlight.current ||
			selection === current ||
			(selection === null && !showCliOptions)
		)
			return false;
		switchInFlight.current = true;
		setSwitching(true);
		let suspended = false;
		let sourceClosed = false;
		let restoreSource = () => {};
		try {
			if (
				!hostUrl ||
				!(await validateAccountLaunch({
					hostUrl,
					agent: data.acpAgentConfigId ?? "claude",
					provider: "claude",
					selection,
				}))
			)
				return false;
			const target = accounts.find(
				(account) => account.selection === selection,
			);
			const { acpSessionId, ...rest } = data;
			const source = acpSessionId
				? await wiring.transport.getSession({ sessionId: acpSessionId })
				: null;
			const sessionId = source?.session?.harnessSessionId ?? nativeSessionId;
			if (
				source?.live &&
				((canStop && !sessionId) ||
					(!canStop &&
						(source.session?.status === "running" ||
							source.session?.status === "awaiting_input")))
			)
				throw new Error(
					t({ message: "Wait for the agent to finish before handing off." }),
				);
			if (acpSessionId) restoreSource = markChatSessionClosed(acpSessionId);
			suspended = true;
			ctx.actions.updateData({ ...data, agent: undefined });
			if (canStop && source?.live && acpSessionId && sessionId) {
				const result = await switchChat({
					workspaceId,
					terminalId: data.terminalId,
					chatSessionId: acpSessionId,
					sessionId,
					targetSelection: selection,
				});
				ctx.actions.updateData({
					...data,
					acpSessionId: result.sessionId,
					acpAccountSelection: result.switched ? selection : current,
				});
				if (!result.switched) {
					toast.error(t({ message: "Couldn't switch account" }), {
						description: result.error,
					});
					return false;
				}
			} else {
				if (acpSessionId)
					await wiring.transport.closeSession({ sessionId: acpSessionId });
				sourceClosed = true;
				if (sessionId)
					await moveChat({
						agent: "claude",
						sessionId,
						targetSelection: selection,
						workspaceId,
						terminalId: data.terminalId,
					});
				ctx.actions.updateData({ ...rest, acpAccountSelection: selection });
			}
			toast.success(
				t({ message: `Chat moved to ${target?.name ?? selection ?? ""}` }),
			);
			return true;
		} catch (error) {
			if (suspended) {
				if (
					sourceClosed ||
					(error instanceof TRPCClientError &&
						[
							"BAD_REQUEST",
							"PRECONDITION_FAILED",
							"CONFLICT",
							"NOT_FOUND",
						].includes(error.data?.code))
				)
					restoreSource();
				ctx.actions.updateData(data);
			}
			toast.error(t({ message: "Couldn't switch account" }), {
				description: errorMessage(error, t({ message: "Unknown error" })),
			});
			return false;
		} finally {
			switchInFlight.current = false;
			setSwitching(false);
		}
	};

	return {
		agentLabel: AGENT_IDENTITY_LABELS.claude,
		current,
		accounts,
		switching,
		canStop,
		onSwitch,
	};
}
