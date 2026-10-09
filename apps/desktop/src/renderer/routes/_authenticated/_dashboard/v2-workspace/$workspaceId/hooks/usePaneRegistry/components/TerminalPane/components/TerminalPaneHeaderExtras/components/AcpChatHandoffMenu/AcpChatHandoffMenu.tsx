import { Trans, useLingui } from "@lingui/react/macro";
import { acpHarnessForPreset } from "@superset/chat/core";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { workspaceTrpc } from "@superset/workspace-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, MessageSquare, PanelRight, SquareStack } from "lucide-react";
import { useRef, useState } from "react";
import { AgentSelect } from "renderer/components/AgentSelect";
import { ForkUsageSummary } from "renderer/components/ForkUsageSummary";
import { useHostUsageQuota } from "renderer/hooks/host-service/useHostUsageQuota";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { validateAccountLaunch } from "renderer/lib/fork-account-launch";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type {
	PaneViewerData,
	TerminalPaneData,
} from "../../../../../../../../types";
import { markChatSessionClosed } from "../../../../../../../../utils/closedChatSessions";
import type { OpenAgentChat } from "../../../../../../../useAgentSessionLauncher/useAgentSessionLauncher";
import { useForkAgentSwitch } from "../../../../../AgentTerminalPane/hooks/useForkAgentSwitch";
import { useChatWiring } from "../../../../../ChatSession/hooks/useSessionClient";
import { useForkAccountSwitch } from "../../../../../ForkChatExtras/hooks/useForkAccountSwitch";
import { contextHandoff } from "../../../../../ForkChatExtras/utils/contextHandoff/contextHandoff";

type Placement = "this-chat" | "split-pane" | "new-tab";

const CONFIGURED_ACCOUNT = "__configured_account__";
const SYSTEM_ACCOUNT = "__system_account__";

export function AcpChatHandoffMenu({
	ctx,
	workspaceId,
	data,
	onOpenAgentChat,
}: {
	ctx: RendererContext<PaneViewerData>;
	workspaceId: string;
	data: TerminalPaneData;
	onOpenAgentChat: OpenAgentChat;
}) {
	const { t } = useLingui();
	const { switchInPlace } = useForkAgentSwitch(workspaceId, ctx, data);
	const binding = useTerminalAgentBinding(workspaceId, data.terminalId);
	const sourceSelection = binding?.account
		? binding.account.selection
		: data.acpAccountSelection;

	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const { data: configs = [] } = useV2AgentConfigs(hostUrl);
	const wiring = useChatWiring();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const accountSwitcher = useForkAccountSwitch(workspaceId, ctx);
	const [targetConfigId, setTargetConfigId] = useState("");
	const [account, setAccount] = useState(CONFIGURED_ACCOUNT);
	const [placement, setPlacement] = useState<Placement>("this-chat");
	const [transferId, setTransferId] = useState(() => crypto.randomUUID());
	const [stage, setStage] = useState<"converting" | "launching" | null>(null);
	const [failed, setFailed] = useState(false);
	const runSequence = useRef(0);
	const prepareAcpLaunch = workspaceTrpc.agents.prepareAcpLaunch.useMutation();
	const prepareFromChat =
		workspaceTrpc.sessionTransfer.prepareFromChat.useMutation();
	const cancelTransfer = workspaceTrpc.sessionTransfer.cancel.useMutation();
	const { data: capabilities } =
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
	const targets = configs.filter(
		(config) =>
			config === sameAgentConfig ||
			(config.presetId !== sourcePreset &&
				acpHarnessForPreset(config.presetId)),
	);
	const target = targets.find((config) => config.id === targetConfigId);
	const sameAgent = target !== undefined && target === sameAgentConfig;
	const managed = target?.presetId === "claude" || target?.presetId === "codex";
	const quota = useHostUsageQuota(open && managed ? hostUrl : null);
	const options = useQuery({
		queryKey: ["agent-launch-account-options", hostUrl, target?.presetId],
		enabled: open && managed && !!hostUrl,
		queryFn: () =>
			hostUrl && target
				? getHostServiceClientByUrl(hostUrl).agents.accountOptions.query({
						agent: target.presetId,
					})
				: [],
		retry: false,
		staleTime: 30_000,
	});
	const status = stored?.session?.status;
	const busy = status === "running" || status === "awaiting_input";
	const available =
		sameAgent ||
		Boolean(
			capabilities?.nativeAvailable &&
				sourceSessionId &&
				verified(sourcePreset) &&
				verified(target?.presetId) &&
				target?.resumeArgs?.length,
		);
	const pickedSelection =
		account === CONFIGURED_ACCOUNT
			? undefined
			: account === SYSTEM_ACCOUNT
				? null
				: account;
	const accountMissing =
		sameAgent &&
		(pickedSelection === undefined ||
			pickedSelection === accountSwitcher?.current);
	if (!sourcePreset) return null;
	const sourceLabel =
		configs.find(
			(config) =>
				config.id === data.acpAgentConfigId || config.presetId === sourcePreset,
		)?.label ?? sourcePreset;

	const reset = () => {
		setTransferId(crypto.randomUUID());
		setFailed(false);
	};

	const start = async () => {
		if (sameAgent && accountSwitcher && pickedSelection !== undefined) {
			setOpen(false);
			accountSwitcher.onSwitch(pickedSelection);
			return;
		}
		if (!target || !sourceSessionId) return;
		const accountSelection =
			managed && options.isSuccess && account !== CONFIGURED_ACCOUNT
				? account === SYSTEM_ACCOUNT
					? null
					: account
				: undefined;
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
				model: null,
				modeId: undefined,
				handoffPrompt: null,
				transferId,
				configId: target.id,
				...(accountSelection !== undefined ? { accountSelection } : {}),
			});
			if (run !== runSequence.current) return;
			setStage(null);
			setTransferId(crypto.randomUUID());
			if (switched) setOpen(false);
			else setFailed(true);
			return;
		}
		const run = ++runSequence.current;
		setFailed(false);
		setStage("converting");
		try {
			const launch = await prepareAcpLaunch.mutateAsync({
				workspaceId,
				configId: target.id,
				...(managed && options.isSuccess && account !== CONFIGURED_ACCOUNT
					? { accountSelection: account === SYSTEM_ACCOUNT ? null : account }
					: {}),
			});
			const targetTerminalId = crypto.randomUUID();
			const transfer = await prepareFromChat.mutateAsync({
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
			const opened = await onOpenAgentChat({
				configId: launch.agentConfigId,
				accountSelection: launch.accountSelection,
				placement,
				resumeSessionId: transfer.targetSessionId,
				terminalId: targetTerminalId,
			});
			if (!opened) {
				setFailed(true);
				return;
			}
			setOpen(false);
			toast.success(t({ message: "Native handoff complete" }), {
				duration: 15_000,
				description: (
					<div className="flex flex-col gap-1">
						<span>
							{sourceLabel} → {target.label}
						</span>
						<code className="break-all text-xs">
							{transfer.targetSessionId}
						</code>
						{transfer.warnings.length > 1 && (
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

	const currentAccount =
		accountSwitcher?.accounts.find(
			(choice) => choice.selection === accountSwitcher.current,
		)?.name ??
		binding?.account?.email ??
		(data.acpAccountSelection
			? data.acpAccountSelection.split("/").at(-1)
			: t({ message: "System default" }));
	const continueWithContext = async () => {
		if (!target || !chatSessionId || busy || stage) return;
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
				await wiring.transport.closeSession({ sessionId: chatSessionId });
				ctx.actions.updateData({
					terminalId: data.terminalId,
					agentSurface: "acp",
					agent: { id: target.presetId },
					acpAgentConfigId: launch.agentConfigId,
					acpAccountSelection: launch.accountSelection,
					pendingPrompt: prompt,
				});
				ctx.actions.setTitle(target.label);
			} else {
				const opened = await onOpenAgentChat({
					configId: launch.agentConfigId,
					accountSelection: launch.accountSelection,
					placement,
					prompt,
				});
				if (!opened) throw new Error("chat_unavailable");
			}
			setOpen(false);
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

	return (
		<>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label={`${t({ message: "Agent" })} · ${t({ message: "Account" })}`}
						onClick={() => {
							reset();
							setTargetConfigId(sameAgentConfig?.id ?? "");
							setAccount(CONFIGURED_ACCOUNT);
							setPlacement("this-chat");
							setOpen(true);
						}}
						className="flex min-w-0 items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
					>
						<Bot className="size-3.5 shrink-0" />
						<span className="max-w-28 truncate">{sourceLabel}</span>
						<span aria-hidden="true">·</span>
						<span className="max-w-28 truncate">{currentAccount}</span>
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<Trans>Agent</Trans> · <Trans>Account</Trans>
				</TooltipContent>
			</Tooltip>
			<Dialog
				open={open}
				onOpenChange={(next) => {
					if (next || stage === "launching") return;
					if (stage === "converting") {
						++runSequence.current;
						cancelTransfer.mutate({ transferId });
						setStage(null);
						setTransferId(crypto.randomUUID());
					}
					setOpen(false);
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>
							<Trans>Agent</Trans> · <Trans>Account</Trans>
						</DialogTitle>
						<DialogDescription>
							{sameAgent ? (
								<Trans>
									Move this chat to another account. The conversation stays here
									and continues with that account's quota.
								</Trans>
							) : (
								<Trans>
									Create a resumable session with the conversation history.
									Permissions and credentials stay with the target agent.
								</Trans>
							)}
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-4 py-1">
						{target && !available && (
							<p className="text-muted-foreground text-xs">
								<Trans>
									Native handoff is unavailable for this agent pair or host.
								</Trans>
							</p>
						)}
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
						<div className="flex flex-col gap-2">
							<Label>
								<Trans>Target agent</Trans>
							</Label>
							<AgentSelect
								agents={targets.map((config) => ({
									id: config.id,
									label: config.label,
									iconId: config.presetId,
									presetId: config.presetId,
								}))}
								value={targetConfigId}
								placeholder={t({ message: "Select an agent" })}
								onValueChange={(id) => {
									setTargetConfigId(id);
									setAccount(CONFIGURED_ACCOUNT);
									if (id === sameAgentConfig?.id) setPlacement("this-chat");
									reset();
								}}
								disabled={stage !== null || targets.length === 0}
								triggerClassName="w-full"
								onBeforeConfigureAgents={() => setOpen(false)}
							/>
						</div>
						{managed && (
							<div className="flex flex-col gap-2">
								<Label>
									<Trans>Account</Trans>
								</Label>
								<Select
									value={
										sameAgent && account === CONFIGURED_ACCOUNT ? "" : account
									}
									onValueChange={(value) => {
										setAccount(value);
										reset();
									}}
									disabled={stage !== null || !options.isSuccess}
								>
									<SelectTrigger
										aria-label={t({ message: "Account" })}
										className="w-full"
									>
										<SelectValue
											placeholder={t({ message: "Choose an account" })}
										/>
									</SelectTrigger>
									<SelectContent>
										{!sameAgent && (
											<SelectItem value={CONFIGURED_ACCOUNT}>
												<Trans>Configured account</Trans>
											</SelectItem>
										)}
										{options.data
											?.filter(
												(option) =>
													!sameAgent ||
													option.selection !== accountSwitcher?.current,
											)
											.map((option) => (
												<SelectItem
													key={option.selection ?? SYSTEM_ACCOUNT}
													value={option.selection ?? SYSTEM_ACCOUNT}
												>
													{option.selection === null && !option.alias ? (
														<Trans>System default</Trans>
													) : (
														(option.alias ?? option.label)
													)}
													<span className="ml-2">
														<ForkUsageSummary
															compact
															account={quota.data?.find(
																(row) =>
																	row.agent === target?.presetId &&
																	row.selection === option.selection,
															)}
														/>
													</span>
												</SelectItem>
											))}
									</SelectContent>
								</Select>
								<ForkUsageSummary
									account={quota.data?.find(
										(row) =>
											row.agent === target?.presetId &&
											(pickedSelection === undefined
												? row.isDefault
												: row.selection === pickedSelection),
									)}
								/>
							</div>
						)}
						<dl className="rounded-md border bg-muted/30 p-3 text-xs">
							<dt className="text-muted-foreground">
								<Trans>Source</Trans>
							</dt>
							<dd className="break-words">
								{sourceLabel} · {currentAccount}
							</dd>
							<dd className="mt-2">
								<details>
									<summary className="cursor-pointer text-muted-foreground">
										<Trans>Session</Trans>
									</summary>
									<code className="mt-1 block break-all">
										{sourceSessionId ?? "—"}
									</code>
								</details>
							</dd>
						</dl>
						<div className="flex flex-col gap-2">
							<Label>
								<Trans>Open session in</Trans>
							</Label>
							<div className="grid grid-cols-3 gap-2" role="radiogroup">
								<Button
									type="button"
									variant={placement === "this-chat" ? "secondary" : "outline"}
									onClick={() => setPlacement("this-chat")}
									aria-pressed={placement === "this-chat"}
									disabled={stage !== null}
								>
									<MessageSquare />
									<Trans>This chat</Trans>
								</Button>
								<Button
									type="button"
									variant={placement === "split-pane" ? "secondary" : "outline"}
									onClick={() => setPlacement("split-pane")}
									aria-pressed={placement === "split-pane"}
									disabled={stage !== null || sameAgent}
								>
									<PanelRight />
									<Trans>Split pane</Trans>
								</Button>
								<Button
									type="button"
									variant={placement === "new-tab" ? "secondary" : "outline"}
									onClick={() => setPlacement("new-tab")}
									aria-pressed={placement === "new-tab"}
									disabled={stage !== null || sameAgent}
								>
									<SquareStack />
									<Trans>New tab</Trans>
								</Button>
							</div>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="ghost"
							disabled={stage === "launching"}
							onClick={() => {
								if (stage === "converting") {
									++runSequence.current;
									cancelTransfer.mutate({ transferId });
									setStage(null);
									setTransferId(crypto.randomUUID());
								}
								setOpen(false);
							}}
						>
							<Trans>Cancel</Trans>
						</Button>
						{target && !sameAgent && (failed || !available) && (
							<div className="flex flex-col gap-2">
								<p className="text-muted-foreground text-xs">
									<Trans>
										Context transfer includes only messages and may omit earlier
										history.
									</Trans>
								</p>
								<Button
									variant="outline"
									disabled={busy || stage !== null}
									onClick={() => void continueWithContext()}
								>
									<Trans>Continue with context</Trans>
								</Button>
							</div>
						)}
						<Button
							onClick={start}
							disabled={
								stage !== null ||
								!available ||
								busy ||
								!target ||
								accountMissing
							}
						>
							{stage === "converting" ? (
								<Trans>Converting…</Trans>
							) : stage === "launching" ? (
								<Trans>Launching…</Trans>
							) : (
								<Trans>Continue</Trans>
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
