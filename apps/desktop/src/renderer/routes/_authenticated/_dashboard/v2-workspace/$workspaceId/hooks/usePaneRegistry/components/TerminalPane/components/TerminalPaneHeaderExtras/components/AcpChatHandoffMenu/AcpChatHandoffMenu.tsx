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
import { useQuery } from "@tanstack/react-query";
import { Bot, MessageSquare, PanelRight, SquareStack } from "lucide-react";
import { useRef, useState } from "react";
import { AgentSelect } from "renderer/components/AgentSelect";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { acpHarnessForPreset } from "renderer/lib/acpHarness";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type {
	PaneViewerData,
	TerminalPaneData,
} from "../../../../../../../../types";
import type { OpenAgentChat } from "../../../../../../../useAgentSessionLauncher/useAgentSessionLauncher";
import { useForkAgentSwitch } from "../../../../../AgentTerminalPane/hooks/useForkAgentSwitch";
import { useChatWiring } from "../../../../../ChatSession/hooks/useSessionClient";
import { useForkAccountSwitch } from "../../../../../ForkChatExtras/hooks/useForkAccountSwitch";

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
	const accountSwitcher = useForkAccountSwitch(workspaceId, ctx);
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const { data: configs = [] } = useV2AgentConfigs(hostUrl);
	const wiring = useChatWiring();
	const [open, setOpen] = useState(false);
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
				acpHarnessForPreset(config.presetId) &&
				config.resumeArgs?.length &&
				verified(config.presetId)),
	);
	const target = targets.find((config) => config.id === targetConfigId);
	const sameAgent = target !== undefined && target === sameAgentConfig;
	const managed = target?.presetId === "claude" || target?.presetId === "codex";
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
				verified(sourcePreset),
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
		if (placement === "this-chat") {
			setOpen(false);
			const switched = await switchInPlace({
				presetId: target.presetId,
				label: target.label,
				model: null,
				modeId: undefined,
				handoffPrompt: null,
				configId: target.id,
				...(accountSelection !== undefined ? { accountSelection } : {}),
			});
			if (!switched)
				toast.error(t({ message: "Native handoff failed. You can retry." }));
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
				...(data.acpAccountSelection !== undefined
					? { sourceAccountSelection: data.acpAccountSelection }
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

	return (
		<>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label={t({ message: "Continue with another agent" })}
						onClick={() => {
							reset();
							setTargetConfigId("");
							setAccount(CONFIGURED_ACCOUNT);
							setOpen(true);
						}}
						className="hidden rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground @min-[200px]/pane-header:block"
					>
						<Bot className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<Trans>Continue with another agent</Trans>
				</TooltipContent>
			</Tooltip>
			<Dialog
				open={open}
				onOpenChange={(next) => {
					if (!next && stage !== "launching") setOpen(false);
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>
							<Trans>Continue with another agent</Trans>
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
						{!available && (
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
														option.label
													)}
												</SelectItem>
											))}
									</SelectContent>
								</Select>
							</div>
						)}
						<dl className="rounded-md border bg-muted/30 p-3 text-xs">
							<dt className="text-muted-foreground">
								<Trans>Source</Trans>
							</dt>
							<dd>{sourceLabel}</dd>
							<dt className="mt-2 text-muted-foreground">
								<Trans>Session</Trans>
							</dt>
							<dd className="break-all font-mono">{sourceSessionId ?? "—"}</dd>
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
