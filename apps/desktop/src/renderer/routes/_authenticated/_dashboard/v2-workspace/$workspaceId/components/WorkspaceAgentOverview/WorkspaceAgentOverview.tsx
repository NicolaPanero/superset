import { Trans, useLingui } from "@lingui/react/macro";
import type { WorkspaceStore } from "@superset/panes";
import { getAgentModelSupport } from "@superset/shared/agent-models";
import { agentStatusFromEvent } from "@superset/shared/agent-status";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bot, History, Plus } from "lucide-react";
import { useRef, useState } from "react";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { AgentModelSelect } from "renderer/components/AgentModelSelect";
import { AgentSelect } from "renderer/components/AgentSelect";
import { useAgentAccountAliases } from "renderer/hooks/host-service/useAgentAccountAliases";
import {
	type TerminalAgentBinding,
	useTerminalAgentBindings,
} from "renderer/hooks/host-service/useTerminalAgentBindings/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { CreateNewAgentSession } from "../../hooks/useAgentSessionLauncher/useAgentSessionLauncher";
import { useChatWiring } from "../../hooks/usePaneRegistry/components/ChatSession/hooks/useSessionClient";
import type {
	ChatPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";
import { AcpOverviewSession } from "./components/AcpOverviewSession";
import { ForkImportChatDialog } from "./components/ForkImportChatDialog";

const PEERS = [
	{ id: "claude", label: "Claude Code" },
	{ id: "codex", label: "Codex" },
	{ id: "cursor-agent", label: "Cursor Agent" },
	{ id: "grok", label: "Grok Build" },
	{ id: "opencode", label: "OpenCode" },
] as const;
const CONFIGURED_ACCOUNT = "__configured_account__";
const SYSTEM_ACCOUNT = "__system_account__";

function LiveSession({
	binding,
	hostUrl,
	launch,
	onOpen,
}: {
	binding: TerminalAgentBinding;
	hostUrl: string | null;
	launch?: { label: string; model: string | null };
	onOpen: () => void;
}) {
	const { t } = useLingui();
	const managed = binding.agentId === "claude" || binding.agentId === "codex";
	const aliases = useAgentAccountAliases(managed ? hostUrl : null);
	const account = useQuery({
		queryKey: [
			"session-usage-account",
			hostUrl,
			binding.workspaceId,
			binding.terminalId,
			binding.startedAt,
			binding.agentSessionId,
			binding.launchId,
		],
		enabled: !!hostUrl && managed,
		queryFn: () =>
			hostUrl
				? getHostServiceClientByUrl(hostUrl).usage.sessionAccount.query({
						workspaceId: binding.workspaceId,
						terminalId: binding.terminalId,
						startedAt: binding.startedAt,
					})
				: null,
		retry: false,
		staleTime: 30_000,
		refetchInterval: 30_000,
	});
	const status = agentStatusFromEvent(binding.lastEventType);
	const statusLabel =
		status === "working"
			? t({ message: "Running" })
			: status === "permission"
				? t({ message: "Awaiting permission" })
				: status === "failed"
					? t({ message: "Failed" })
					: t({ message: "Idle" });
	const profileAlias = account.data
		? aliases.data?.find(
				(alias) =>
					alias.agent === account.data?.agent &&
					alias.selection === account.data?.selection,
			)?.label
		: undefined;
	const accountLabel =
		profileAlias ??
		(account.data?.credentialKind === "api_key"
			? t({ message: "API billing" })
			: (account.data?.email ??
				(managed
					? t({ message: "Login unverified" })
					: t({ message: "Managed by the CLI" }))));
	return (
		<div
			className="space-y-2 rounded-md border bg-muted/20 p-3 text-xs"
			data-agent-session={binding.terminalId}
		>
			<p className="font-medium">{statusLabel}</p>
			{launch && (
				<p className="truncate" title={launch.label}>
					{launch.label}
				</p>
			)}
			<p className="break-words">
				<Trans>Launch model</Trans>:{" "}
				{launch
					? (launch.model ?? t({ message: "CLI default" }))
					: t({ message: "Not recorded" })}
			</p>
			<p className="break-words">
				<Trans>Account</Trans>: {accountLabel}
			</p>
			<Button variant="outline" size="sm" onClick={onOpen}>
				<Trans>Open session</Trans>
			</Button>
		</div>
	);
}

export function WorkspaceAgentOverview({
	workspaceId,
	workspaceName,
	onCreateNewAgentSession,
	onFocusAgentTerminal,
	store,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	workspaceId: string;
	workspaceName: string;
	onCreateNewAgentSession: CreateNewAgentSession;
	onFocusAgentTerminal: (terminalId: string) => void;
}) {
	const { t } = useLingui();
	const dark = useIsDarkTheme();
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const [open, setOpen] = useState(false);
	const [launchOpen, setLaunchOpen] = useState(false);
	const [importOpen, setImportOpen] = useState(false);
	const [configId, setConfigId] = useState<string>();
	const [model, setModel] = useState<string | null>(null);
	const [account, setAccount] = useState(CONFIGURED_ACCOUNT);
	const [busy, setBusy] = useState(false);
	const launchLock = useRef(false);
	const configs = useV2AgentConfigs(hostUrl);
	const peers =
		configs.data?.filter((config) =>
			PEERS.some((peer) => peer.id === config.presetId),
		) ?? [];
	const selected = peers.find((config) => config.id === configId);
	const models = selected
		? (getAgentModelSupport(selected.presetId)?.models ?? [])
		: [];
	const tabs = useStore(store, (s) => s.tabs);
	const chatPanes = tabs
		.flatMap((tab) => Object.values(tab.panes))
		.map((p) =>
			p.kind === "chat-v3"
				? {
						...p,
						kind: "terminal",
						data: {
							...p.data,
							agentSurface: "acp",
							acpSessionId: (p.data as ChatPaneData).sessionId,
						},
					}
				: p,
		)
		.filter(
			(p) =>
				p.kind === "terminal" &&
				(p.data as TerminalPaneData).agentSurface === "acp",
		);
	const wiring = useChatWiring();
	const chats = useQuery({
		queryKey: [
			"overview-acp",
			hostUrl,
			workspaceId,
			chatPanes.map((p) => (p.data as TerminalPaneData).acpSessionId).join(","),
		],
		enabled: open && chatPanes.length > 0,
		queryFn: async () =>
			Promise.all(
				chatPanes.map(async (pane) => {
					const data = pane.data as TerminalPaneData;
					const session = data.acpSessionId
						? await wiring.transport
								.getSession({ sessionId: data.acpSessionId })
								.catch(() => null)
						: null;
					return { data, session };
				}),
			),
		retry: false,
		refetchInterval: 5000,
	});
	const bindings = useTerminalAgentBindings(workspaceId, { enabled: open });
	const details = useQuery({
		queryKey: [
			"agent-launch-details",
			hostUrl,
			workspaceId,
			[...bindings.values()].map((binding) => binding.terminalId).join(","),
		],
		enabled: open && !!hostUrl,
		queryFn: () =>
			hostUrl
				? getHostServiceClientByUrl(hostUrl).agents.launchDetails.query({
						workspaceId,
					})
				: [],
		retry: false,
		staleTime: 30_000,
	});
	const exited = useQuery({
		queryKey: ["agent-exited-terminals", hostUrl, workspaceId],
		enabled: open && !!hostUrl,
		queryFn: () =>
			hostUrl
				? getHostServiceClientByUrl(hostUrl).agents.exitedAgentTerminals.query({
						workspaceId,
					})
				: [],
		retry: false,
		refetchInterval: 5000,
	});
	const managed =
		selected?.presetId === "claude" || selected?.presetId === "codex";
	const options = useQuery({
		queryKey: ["agent-launch-account-options", hostUrl, selected?.presetId],
		enabled: launchOpen && managed && !!hostUrl,
		queryFn: () =>
			hostUrl && selected
				? getHostServiceClientByUrl(hostUrl).agents.accountOptions.query({
						agent: selected.presetId,
					})
				: [],
		retry: false,
		staleTime: 30_000,
	});
	const selectConfig = (id: string) => {
		setConfigId(id);
		setModel(null);
		setAccount(CONFIGURED_ACCOUNT);
	};
	const newSession = (id?: string) => {
		selectConfig(id ?? peers[0]?.id ?? "");
		setOpen(false);
		setLaunchOpen(true);
	};
	const launchSession = async () => {
		if (!selected || launchLock.current) return;
		launchLock.current = true;
		setBusy(true);
		try {
			const result = await onCreateNewAgentSession({
				configId: selected.id,
				placement: "new-tab",
				prompt: "",

				...(model ? { modelId: model } : {}),
				...(managed && options.isSuccess && account !== CONFIGURED_ACCOUNT
					? {
							accountSelection: account === SYSTEM_ACCOUNT ? null : account,
						}
					: {}),
			});
			if (result) setLaunchOpen(false);
		} finally {
			launchLock.current = false;
			setBusy(false);
		}
	};
	return (
		<>
			<Button
				variant="ghost"
				size="sm"
				onClick={() => setOpen(true)}
				aria-label={t({ message: "Workspace agents" })}
			>
				<Bot className="size-4" />
				<Trans>Agents</Trans>
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-5xl">
					<DialogHeader>
						<DialogTitle>
							<Trans>Workspace agents</Trans>
						</DialogTitle>
						<DialogDescription>
							{workspaceName}.{" "}
							<Trans>
								Launch choices are shown when known. The active model can change
								inside the CLI.
							</Trans>
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-wrap gap-2">
						<Button
							size="sm"
							onClick={() => newSession()}
							disabled={!peers.length}
						>
							<Plus className="size-4" />
							<Trans>New agent</Trans>
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setImportOpen(true)}
						>
							<History className="size-4" />
							<Trans>Find a chat</Trans>
						</Button>
						<Button variant="outline" size="sm" asChild>
							<Link
								to="/settings/local-agent-accounts"
								search={{ workspaceId }}
								onClick={() => setOpen(false)}
							>
								<Trans>Agent accounts</Trans>
							</Link>
						</Button>
					</div>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
						{PEERS.map((peer) => {
							const icon = getPresetIcon(peer.id, dark);
							const sessions = [...bindings.values()].filter(
								(binding) =>
									binding.agentId === peer.id &&
									!chatPanes.some(
										(p) =>
											(p.data as TerminalPaneData).terminalId ===
											binding.terminalId,
									) &&
									!binding.endedAt &&
									!exited.data?.includes(binding.terminalId),
							);
							const chatSessions =
								chats.data?.filter(
									(c) => c.data.agent?.id === peer.id && c.session?.session,
								) ?? [];
							const config = peers.find((item) => item.presetId === peer.id);
							return (
								<section
									key={peer.id}
									className="min-w-0 space-y-3 rounded-lg border p-3"
									data-agent-card={peer.id}
								>
									<h3 className="flex items-center gap-2 text-sm font-medium">
										{icon && (
											<img
												src={icon}
												alt=""
												className="size-5 shrink-0 object-contain"
											/>
										)}
										{peer.label}
									</h3>
									{sessions.length === 0 && chatSessions.length === 0 && (
										<p className="text-xs text-muted-foreground">
											<Trans>No active sessions</Trans>
										</p>
									)}
									{chatSessions.map(({ data, session }) => (
										<AcpOverviewSession
											key={data.terminalId}
											agent={peer.id}
											data={data}
											hostUrl={hostUrl}
											status={
												session?.live
													? (session.session?.status ?? "idle")
													: "closed"
											}
											onOpen={() => {
												setOpen(false);
												onFocusAgentTerminal(data.terminalId);
											}}
										/>
									))}
									{sessions.map((binding) => (
										<LiveSession
											key={binding.terminalId}
											binding={binding}
											hostUrl={hostUrl}
											launch={details.data?.find(
												(item) => item.terminalId === binding.terminalId,
											)}
											onOpen={() => {
												setOpen(false);
												onFocusAgentTerminal(binding.terminalId);
											}}
										/>
									))}
									<Button
										className="w-full"
										variant="outline"
										size="sm"
										disabled={!config}
										onClick={() => newSession(config?.id)}
									>
										<Plus className="size-3.5" />
										<Trans>New agent</Trans>
									</Button>
								</section>
							);
						})}
					</div>
					{configs.isError && (
						<p role="alert">
							<Trans>Could not load agent configurations.</Trans>
						</p>
					)}
				</DialogContent>
			</Dialog>
			<Dialog
				open={launchOpen}
				onOpenChange={(value) => {
					if (!busy) setLaunchOpen(value);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							<Trans>New agent</Trans>
						</DialogTitle>
						<DialogDescription>{workspaceName}</DialogDescription>
					</DialogHeader>
					<div className="space-y-2">
						<p className="text-sm">
							<Trans>Agent</Trans>
						</p>
						<AgentSelect
							agents={peers.map((config) => ({
								id: config.id,
								label: config.label,
								iconId: config.presetId,
							}))}
							value={configId}
							placeholder={t({ message: "Select agent" })}
							onValueChange={selectConfig}
							disabled={busy}
							onBeforeConfigureAgents={() => setLaunchOpen(false)}
						/>
					</div>
					{managed && (
						<div className="space-y-2">
							<p className="text-sm">
								<Trans>Account</Trans>
							</p>
							<Select
								value={account}
								onValueChange={setAccount}
								disabled={busy || !options.isSuccess}
							>
								<SelectTrigger aria-label={t({ message: "Account" })}>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={CONFIGURED_ACCOUNT}>
										<Trans>Configured account</Trans>
									</SelectItem>
									{options.data?.map((option) => (
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
					{models.length > 0 && (
						<div className="space-y-2">
							<p className="text-sm">
								<Trans>Model</Trans>
							</p>
							<AgentModelSelect
								models={models}
								value={model}
								onValueChange={setModel}
								defaultLabel={t({ message: "CLI default" })}
								disabled={busy}
							/>
						</div>
					)}
					<div className="space-y-2">
						<p className="text-sm">
							<Trans>Workspace</Trans>
						</p>
						<p className="rounded-md border p-2 text-sm">{workspaceName}</p>
					</div>
					<Button
						onClick={() => void launchSession()}
						disabled={busy || !selected || (managed && options.isPending)}
					>
						{busy ? <Trans>Starting…</Trans> : <Trans>Start</Trans>}
					</Button>
				</DialogContent>
			</Dialog>
			<ForkImportChatDialog
				open={importOpen}
				onOpenChange={setImportOpen}
				onImported={() => setOpen(false)}
				store={store}
				workspaceId={workspaceId}
			/>
		</>
	);
}
