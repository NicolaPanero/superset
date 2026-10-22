import { Trans, useLingui } from "@lingui/react/macro";
import type { RendererContext } from "@superset/panes";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, PanelRight, SquareStack } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ForkAccountEmptyState } from "renderer/components/ForkAccountEmptyState";
import {
	ForkAccountPicker,
	type useForkCreationAccount,
} from "renderer/components/ForkAccountPicker";
import { ForkSegmentedControl } from "renderer/components/ForkSegmentedControl";
import { useHostUsageQuota } from "renderer/hooks/host-service/useHostUsageQuota";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { validateAccountLaunch } from "renderer/lib/fork-account-launch";
import {
	forkLaunchAccountSelection,
	visibleForkAccountOptions,
} from "renderer/lib/fork-account-visibility";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useForkCliOptions } from "renderer/stores/fork-cli-options";
import type { PaneViewerData, TerminalPaneData } from "../../../../../../types";
import { markChatSessionClosed } from "../../../../../../utils/closedChatSessions";
import type { OpenAgentChat } from "../../../../../useAgentSessionLauncher/useAgentSessionLauncher";
import { useForkAgentSwitch } from "../../../AgentTerminalPane/hooks/useForkAgentSwitch";
import { useChatWiring } from "../../../ChatSession/hooks/useSessionClient";
import { useForkAccountSwitch } from "../../hooks/useForkAccountSwitch";
import { contextHandoff } from "../../utils/contextHandoff/contextHandoff";
import { setPendingEffort } from "../../utils/pendingEffort";
import { setPendingModelReset } from "../../utils/pendingModelReset";
import { rememberPreviousChat } from "../../utils/previousChat";
import {
	forkTransferPolicy,
	runForkTransfer,
} from "./utils/forkTransferPolicy";

type Placement = "this-chat" | "split-pane" | "new-tab";
type Transfer = "native" | "context";

const CONFIGURED_ACCOUNT = "__configured_account__";
const SYSTEM_ACCOUNT = "__system_account__";

/** What the composer asked to switch to; null keeps the dialog closed. */
export interface ForkSwitchRequest {
	configId: string;
	/** Undefined uses the target's configured account. */
	accountSelection?: string | null;
	model?: { id: string; label: string } | null;
	effort?: { id: string; label: string } | null;
}

function accountValue(selection: string | null | undefined) {
	if (selection === undefined) return CONFIGURED_ACCOUNT;
	return selection ?? SYSTEM_ACCOUNT;
}

export function ForkChatSwitchDialog({
	ctx,
	workspaceId,
	data,
	request,
	onOpenAgentChat,
	onClose,
}: {
	ctx: RendererContext<PaneViewerData>;
	workspaceId: string;
	data: TerminalPaneData;
	request: ForkSwitchRequest | null;
	onOpenAgentChat: OpenAgentChat;
	onClose: () => void;
}) {
	const { t } = useLingui();
	const open = request !== null;
	const showCliOptions = useForkCliOptions();
	const { switchInPlace } = useForkAgentSwitch(workspaceId, ctx, data);
	const binding = useTerminalAgentBinding(workspaceId, data.terminalId);
	const sourceSelection = binding?.account
		? binding.account.selection
		: data.acpAccountSelection;
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const { data: configs = [] } = useV2AgentConfigs(hostUrl);
	const wiring = useChatWiring();
	const queryClient = useQueryClient();
	const accountSwitcher = useForkAccountSwitch(workspaceId, ctx);
	const [account, setAccount] = useState(CONFIGURED_ACCOUNT);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [adding, setAdding] = useState(false);
	const [reconnect, setReconnect] =
		useState<ReturnType<typeof useForkCreationAccount>["reconnect"]>(null);
	const [placement, setPlacement] = useState<Placement>("this-chat");
	const [transfer, setTransfer] = useState<Transfer>("native");
	const [transferId, setTransferId] = useState(() => crypto.randomUUID());
	const [stage, setStage] = useState<"converting" | "launching" | null>(null);
	const [failed, setFailed] = useState(false);
	const runSequence = useRef(0);
	useEffect(() => {
		if (!request) return;
		setAccount(accountValue(request.accountSelection));
		setPlacement("this-chat");
		setTransfer("native");
		setTransferId(crypto.randomUUID());
		setFailed(false);
	}, [request]);
	const prepareAcpLaunch = workspaceTrpc.agents.prepareAcpLaunch.useMutation();
	const prepareFromChat =
		workspaceTrpc.sessionTransfer.prepareFromChat.useMutation();
	const cancelTransfer = workspaceTrpc.sessionTransfer.cancel.useMutation();
	const { data: capabilities, isPending: checkingCapabilities } =
		workspaceTrpc.sessionTransfer.capabilities.useQuery(undefined, {
			enabled: open,
			retry: false,
			staleTime: 60_000,
		});
	const chatSessionId = data.acpSessionId ?? null;
	const { data: stored } = useQuery({
		enabled: open && chatSessionId !== null,
		queryKey: ["acp-chat-session", chatSessionId],
		queryFn: () =>
			chatSessionId
				? wiring.transport.getSession({ sessionId: chatSessionId })
				: Promise.resolve(null),
		refetchInterval: open ? 2_000 : false,
	});

	const sourcePreset = data.agent?.id;
	const sourceSessionId = data.agent?.sessionId;
	const verified = (preset: string | undefined) =>
		Boolean(
			preset &&
				capabilities?.adapters.find((adapter) => adapter.agent === preset)
					?.verified,
		);
	// The chat's own agent is a target only to move it to another account.
	const sameAgentConfig = accountSwitcher
		? (configs.find((config) => config.id === data.acpAgentConfigId) ??
			configs.find((config) => config.presetId === sourcePreset))
		: undefined;
	const target = configs.find((config) => config.id === request?.configId);
	const sameAgent = target !== undefined && target === sameAgentConfig;
	const managed = target?.presetId === "claude" || target?.presetId === "codex";
	const quota = useHostUsageQuota(open && managed ? hostUrl : null);
	const options = useQuery({
		queryKey: ["fork-account-options", hostUrl, target?.presetId],
		enabled: open && managed && !!hostUrl,
		queryFn: () =>
			hostUrl && target
				? getHostServiceClientByUrl(hostUrl).agents.accountOptions.query({
						agent: target.presetId,
						isolated: true,
					})
				: [],
		retry: false,
		staleTime: 30_000,
	});
	const status = stored?.session?.status;
	const busy = status === "running" || status === "awaiting_input";
	const nativeAvailable = Boolean(
		capabilities?.nativeAvailable &&
			sourceSessionId &&
			verified(sourcePreset) &&
			verified(target?.presetId) &&
			target?.resumeArgs?.length,
	);
	const transferPolicy = forkTransferPolicy(
		sameAgent ? "native" : transfer,
		sameAgent || nativeAvailable,
	);
	const useNative = transferPolicy.mode === "native";
	const choices = visibleForkAccountOptions(options.data ?? [], showCliOptions);
	const configuredSelection = quota.data?.find(
		(row) =>
			row.agent === target?.presetId && row.isDefault && row.selection !== null,
	)?.selection;
	const metadata = useQuery({
		queryKey: ["fork-launch-account", hostUrl, target?.id],
		enabled: open && managed && !!hostUrl && !!target,
		queryFn: () =>
			hostUrl && target
				? getHostServiceClientByUrl(hostUrl).usage.launchAccount.query({
						agent: target.id,
						isolated: true,
					})
				: null,
		retry: false,
		staleTime: 30_000,
	});
	const rawSelection =
		account === CONFIGURED_ACCOUNT
			? undefined
			: account === SYSTEM_ACCOUNT
				? null
				: account;
	const pickedSelection = metadata.data?.environmentOverride
		? undefined
		: forkLaunchAccountSelection(
				rawSelection === undefined && !sameAgent && !showCliOptions
					? configuredSelection
					: rawSelection,
				sameAgent
					? choices.filter(
							(option) => option.selection !== accountSwitcher?.current,
						)
					: choices,
				showCliOptions,
			);
	const accountMissing =
		(managed &&
			!showCliOptions &&
			!metadata.data?.environmentOverride &&
			typeof pickedSelection !== "string") ||
		(sameAgent &&
			(pickedSelection === undefined ||
				pickedSelection === accountSwitcher?.current));
	if (!sourcePreset) return null;
	const sourceLabel =
		configs.find(
			(config) =>
				config.id === data.acpAgentConfigId || config.presetId === sourcePreset,
		)?.label ?? sourcePreset;
	const model = request?.model ?? null;
	const effort = request?.effort ?? null;
	const rememberEffort = (terminalId: string) => {
		if (effort) setPendingEffort(terminalId, effort.id);
		if (!model) setPendingModelReset(terminalId);
	};

	const close = () => {
		if (stage === "launching") return;
		if (stage === "converting") {
			++runSequence.current;
			cancelTransfer.mutate({ transferId });
			setStage(null);
			setTransferId(crypto.randomUUID());
		}
		onClose();
	};

	const switchNatively = async () => {
		if (accountMissing) return;
		if (sameAgent && accountSwitcher && pickedSelection !== undefined) {
			onClose();
			accountSwitcher.onSwitch(pickedSelection);
			return;
		}
		if (!target || !sourceSessionId || !nativeAvailable) return;
		const accountSelection = managed ? pickedSelection : undefined;
		if (
			placement === "this-chat" &&
			hostUrl &&
			!(await validateAccountLaunch({
				hostUrl,
				agent: target.id,
				provider: target.presetId,
				selection: accountSelection,
			}))
		)
			return;
		if (placement === "this-chat") {
			const run = ++runSequence.current;
			setStage("converting");
			setFailed(false);
			const switched = await switchInPlace({
				presetId: target.presetId,
				label: target.label,
				model,
				modeId: undefined,
				handoffPrompt: null,
				transferId,
				configId: target.id,
				...(accountSelection !== undefined ? { accountSelection } : {}),
			});
			if (run !== runSequence.current) return;
			setStage(null);
			setTransferId(crypto.randomUUID());
			if (switched) {
				rememberEffort(data.terminalId);
				rememberPreviousChat(data, sourceLabel, false);
				onClose();
			} else setFailed(true);
			return;
		}
		const run = ++runSequence.current;
		setFailed(false);
		setStage("converting");
		try {
			const launch = await prepareAcpLaunch.mutateAsync({
				workspaceId,
				configId: target.id,
				...(managed && pickedSelection !== undefined
					? { accountSelection: pickedSelection }
					: {}),
			});
			const targetTerminalId = crypto.randomUUID();
			const prepared = await prepareFromChat.mutateAsync({
				workspaceId,
				transferId,
				sourceTerminalId: data.terminalId,
				sourceConfigId:
					configs.find((config) => config.id === data.acpAgentConfigId)
						?.presetId === sourcePreset
						? (data.acpAgentConfigId ?? sourcePreset)
						: sourcePreset,
				sourceSessionId,
				...(sourceSelection !== undefined
					? { sourceAccountSelection: sourceSelection }
					: {}),
				targetConfigId: launch.agentConfigId,
				...(launch.accountSelection !== undefined
					? { targetAccountSelection: launch.accountSelection }
					: {}),
				targetTerminalId,
			});
			if (run !== runSequence.current) return;
			setStage("launching");
			rememberEffort(targetTerminalId);
			const opened = await onOpenAgentChat({
				configId: launch.agentConfigId,
				accountSelection: launch.accountSelection,
				placement,
				resumeSessionId: prepared.targetSessionId,
				terminalId: targetTerminalId,
				...(model ? { modelId: model.id } : {}),
			});
			if (!opened) {
				setFailed(true);
				return;
			}
			onClose();
			toast.success(t({ message: "Native handoff complete" }), {
				duration: 15_000,
				description: (
					<div className="flex flex-col gap-1">
						<span>
							{sourceLabel} → {target.label}
						</span>
						<code className="break-all text-xs">
							{prepared.targetSessionId}
						</code>
						{prepared.warnings.length > 1 && (
							<span>
								{t({
									message:
										"Some agent-specific metadata could not be transferred.",
								})}
							</span>
						)}
					</div>
				),
			});
		} catch (error) {
			console.error("[acp-chat] handoff failed", error);
			if (run === runSequence.current) setFailed(true);
		} finally {
			if (run === runSequence.current) {
				setStage(null);
				setTransferId(crypto.randomUUID());
			}
		}
	};

	const switchWithContext = async () => {
		if (!target || !chatSessionId || busy || stage || accountMissing) return;
		const run = ++runSequence.current;
		setStage("converting");
		let restoreRecovery: (() => void) | undefined;
		try {
			const prompt = await contextHandoff(
				wiring.transport,
				chatSessionId,
				sourceLabel,
			);
			if (run !== runSequence.current) return;
			const selected = managed ? pickedSelection : undefined;
			const launch = await prepareAcpLaunch.mutateAsync({
				workspaceId,
				configId: target.id,
				...(selected !== undefined ? { accountSelection: selected } : {}),
			});
			if (run !== runSequence.current) return;
			setStage("launching");
			if (
				placement === "this-chat" &&
				hostUrl &&
				!(await validateAccountLaunch({
					hostUrl,
					agent: target.id,
					provider: target.presetId,
					selection: selected,
				}))
			)
				return;
			if (placement === "this-chat") {
				restoreRecovery = markChatSessionClosed(chatSessionId);
				rememberEffort(data.terminalId);
				rememberPreviousChat(data, sourceLabel, true);
				ctx.actions.updateData({
					terminalId: data.terminalId,
					agentSurface: "acp",
					agent: { id: target.presetId },
					acpAgentConfigId: launch.agentConfigId,
					acpAccountSelection: launch.accountSelection,
					pendingPrompt: prompt,
					...(model
						? { chatModelId: model.id, chatModelLabel: model.label }
						: {}),
				});
				ctx.actions.setTitle(target.label);
				void wiring.transport
					.closeSession({ sessionId: chatSessionId })
					.catch(() => undefined);
			} else {
				const opened = await onOpenAgentChat({
					configId: launch.agentConfigId,
					accountSelection: launch.accountSelection,
					placement,
					prompt,
					...(model ? { modelId: model.id } : {}),
				});
				if (!opened) throw new Error("chat_unavailable");
				rememberEffort(opened.terminalId);
			}
			onClose();
		} catch (error) {
			console.warn("[acp-chat] context handoff failed", error);
			restoreRecovery?.();
			void queryClient.invalidateQueries({
				queryKey: ["acp-chat-session", chatSessionId],
			});
			if (run === runSequence.current) setFailed(true);
		} finally {
			if (run === runSequence.current) setStage(null);
		}
	};

	const accountPicker: ReturnType<typeof useForkCreationAccount> = {
		hostUrl,
		pickerOpen,
		setPickerOpen,
		adding,
		setAdding,
		reconnect,
		setReconnect,
		quota,
		options,
		refreshDefault: () => metadata.refetch(),
		selection:
			pickedSelection !== undefined || sameAgent
				? pickedSelection
				: (metadata.data?.defaultSelection ?? configuredSelection),
		forcedApi: metadata.data?.environmentOverride ?? false,
		enabled: managed && !!hostUrl,
		available: !!metadata.data,
		choose: (value) => {
			setPickerOpen(false);
			setAccount(accountValue(value));
			setTransferId(crypto.randomUUID());
			setFailed(false);
		},
		confirm: () => Promise.resolve(true),
	};
	const summary = [target?.label, model?.label, effort?.label]
		.filter(Boolean)
		.join(" · ");

	return (
		<Dialog open={open} onOpenChange={(next) => !next && close()}>
			<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{sameAgent ? (
							<Trans>Move to another account</Trans>
						) : (
							<Trans>Switch to {summary}</Trans>
						)}
					</DialogTitle>
					<DialogDescription>
						<Trans>
							The current chat stays open until the new one is running.
						</Trans>
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					{busy && (
						<p className="text-muted-foreground text-xs">
							<Trans>Wait for the agent to finish before handing off.</Trans>
						</p>
					)}
					{failed && (
						<p role="alert" className="text-destructive text-sm">
							<Trans>Native handoff failed. You can retry.</Trans>
						</p>
					)}
					{managed && (
						<div className="flex flex-col gap-2">
							<Label>
								<Trans>Account</Trans>
							</Label>
							<ForkAccountPicker
								account={accountPicker}
								provider={target?.presetId ?? null}
								model={model?.id}
								hidden={sameAgent ? accountSwitcher?.current : undefined}
								disabled={stage !== null}
							/>
							{options.isSuccess &&
								choices.length === 0 &&
								target &&
								!showCliOptions &&
								!metadata.data?.environmentOverride && (
									<ForkAccountEmptyState
										hostUrl={hostUrl}
										agent={target.presetId as "claude" | "codex"}
										onAccountAdded={() => {
											void options.refetch();
											void quota.refetch();
											void metadata.refetch();
										}}
									/>
								)}
						</div>
					)}
					{!sameAgent && (
						<div className="flex flex-col gap-2">
							<Label>
								<Trans>Open session in</Trans>
							</Label>
							<ForkSegmentedControl
								label={t({ message: "Open session in" })}
								value={placement}
								onChange={setPlacement}
								disabled={stage !== null}
								segments={[
									{
										value: "this-chat",
										icon: MessageSquare,
										label: <Trans>This chat</Trans>,
									},
									{
										value: "split-pane",
										icon: PanelRight,
										label: <Trans>Split pane</Trans>,
									},
									{
										value: "new-tab",
										icon: SquareStack,
										label: <Trans>New tab</Trans>,
									},
								]}
							/>
						</div>
					)}
					{!sameAgent && (
						<div className="flex flex-col gap-2">
							<Label>
								<Trans>Transfer</Trans>
							</Label>
							<ForkSegmentedControl
								label={t({ message: "Transfer" })}
								value={useNative ? "native" : "context"}
								onChange={setTransfer}
								disabled={stage !== null}
								segments={[
									{
										value: "native",
										label: <Trans>Full history</Trans>,
										disabled: !nativeAvailable,
									},
									{ value: "context", label: <Trans>Summary only</Trans> },
								]}
							/>
							{!nativeAvailable && transfer === "native" && (
								<output className="text-muted-foreground text-xs">
									{checkingCapabilities ? (
										<Trans>Checking…</Trans>
									) : (
										<Trans>
											Native handoff is unavailable for this agent pair or host.
										</Trans>
									)}
								</output>
							)}
							<p className="text-muted-foreground text-xs">
								{useNative ? (
									<Trans>
										The new agent resumes the whole conversation, tools
										included.
									</Trans>
								) : (
									<Trans>
										Context transfer includes only messages and may omit earlier
										history.
									</Trans>
								)}
							</p>
						</div>
					)}
				</div>
				<DialogFooter>
					<Button
						variant="ghost"
						disabled={stage === "launching"}
						onClick={close}
					>
						<Trans>Cancel</Trans>
					</Button>
					<Button
						onClick={() =>
							void runForkTransfer(transferPolicy, {
								native: switchNatively,
								context: switchWithContext,
							})
						}
						disabled={
							stage !== null ||
							busy ||
							!target ||
							accountMissing ||
							!transferPolicy.allowed
						}
					>
						{stage === "converting" ? (
							<Trans>Converting…</Trans>
						) : stage === "launching" ? (
							<Trans>Launching…</Trans>
						) : (
							<Trans>Switch</Trans>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
