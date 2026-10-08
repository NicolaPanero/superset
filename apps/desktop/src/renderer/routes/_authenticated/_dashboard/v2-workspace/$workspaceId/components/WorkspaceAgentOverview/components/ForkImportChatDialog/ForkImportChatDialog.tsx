import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { formatRelativeTime } from "@superset/i18n/format";
import type { WorkspaceStore } from "@superset/panes";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { Spinner } from "@superset/ui/spinner";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { acpHarnessForPreset } from "renderer/lib/acpHarness";
import type { StoreApi } from "zustand/vanilla";
import { useAgentSessionLauncher } from "../../../../hooks/useAgentSessionLauncher";
import type { PaneViewerData } from "../../../../types";

const ALL = "all";

type ExternalSession = {
	agent: string;
	sessionId: string;
	title: string | null;
	preview: string | null;
	timestamp: string;
	updatedAt: string | null;
	gitBranch: string | null;
	model: string | null;
	accountSelection: string | null;
	inSuperset: boolean;
};

function accountName(selection: string | null) {
	if (!selection) return null;
	const name = selection.split("/").filter(Boolean).at(-1) ?? selection;
	return name.replace(/^\.(claude|codex)-?/, "") || name;
}

/** Chats started outside Superset in this folder; one click continues one here. */
export function ForkImportChatDialog({
	open,
	onOpenChange,
	onImported,
	store,
	workspaceId,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onImported: () => void;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	workspaceId: string;
}) {
	const { t } = useLingui();
	const dark = useIsDarkTheme();
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const { data: configs = [] } = useV2AgentConfigs(hostUrl);
	const { openAgentChat } = useAgentSessionLauncher({ workspaceId, store });
	const [query, setQuery] = useState("");
	const [agentFilter, setAgentFilter] = useState(ALL);
	const [busy, setBusy] = useState<string | null>(null);
	const listing = workspaceTrpc.sessionTransfer.externalSessions.useQuery(
		{ workspaceId },
		{ enabled: open, retry: false, staleTime: 30_000 },
	);
	const { data: capabilities } =
		workspaceTrpc.sessionTransfer.capabilities.useQuery(undefined, {
			enabled: open,
			retry: false,
			staleTime: 60_000,
		});
	const { mutateAsync: prepareCursorSurface } =
		workspaceTrpc.agents.prepareCursorSurface.useMutation();
	const { mutateAsync: prepareAcpLaunch } =
		workspaceTrpc.agents.prepareAcpLaunch.useMutation();
	const { mutateAsync: prepareFromChat } =
		workspaceTrpc.sessionTransfer.prepareFromChat.useMutation();

	const sessions = (listing.data ?? []) as ExternalSession[];
	const chatConfig = (presetId: string) =>
		configs.find(
			(config) =>
				config.presetId === presetId && acpHarnessForPreset(config.presetId),
		);
	const verified = (presetId: string) =>
		Boolean(
			capabilities?.nativeAvailable &&
				capabilities.adapters.find((adapter) => adapter.agent === presetId)
					?.verified,
		);
	const agents = [...new Set(sessions.map((session) => session.agent))];
	const needle = query.trim().toLowerCase();
	const visible = useMemo(
		() =>
			sessions.filter(
				(session) =>
					(agentFilter === ALL || session.agent === agentFilter) &&
					(!needle ||
						`${session.title ?? ""} ${session.preview ?? ""} ${session.model ?? ""} ${session.gitBranch ?? ""} ${session.sessionId}`
							.toLowerCase()
							.includes(needle)),
			),
		[sessions, agentFilter, needle],
	);
	const labelFor = (presetId: string) =>
		chatConfig(presetId)?.label ?? presetId;

	const run = async (session: ExternalSession, targetPresetId: string) => {
		const key = `${session.agent}:${session.sessionId}`;
		const target = chatConfig(targetPresetId);
		const source = chatConfig(session.agent);
		if (!target) return;
		const managed = session.agent === "claude" || session.agent === "codex";
		setBusy(key);
		try {
			if (targetPresetId === session.agent) {
				if (session.agent === "cursor-agent")
					await prepareCursorSurface({
						workspaceId,
						configId: target.id,
						sessionId: session.sessionId,
						from: "cli",
					});
				const opened = await openAgentChat({
					configId: target.id,
					placement: "new-tab",
					resumeSessionId: session.sessionId,
					...(managed ? { accountSelection: session.accountSelection } : {}),
				});
				if (!opened) throw new Error("chat_unavailable");
			} else {
				const launch = await prepareAcpLaunch({
					workspaceId,
					configId: target.id,
				});
				const targetTerminalId = crypto.randomUUID();
				const transfer = await prepareFromChat({
					workspaceId,
					transferId: crypto.randomUUID(),
					sourceTerminalId: crypto.randomUUID(),
					sourceConfigId: source?.id ?? session.agent,
					sourceSessionId: session.sessionId,
					...(managed
						? { sourceAccountSelection: session.accountSelection }
						: {}),
					targetConfigId: launch.agentConfigId,
					...(launch.accountSelection !== undefined
						? { targetAccountSelection: launch.accountSelection }
						: {}),
					targetTerminalId,
					sourceExternal: true,
				});
				const opened = await openAgentChat({
					configId: launch.agentConfigId,
					accountSelection: launch.accountSelection,
					placement: "new-tab",
					resumeSessionId: transfer.targetSessionId,
					terminalId: targetTerminalId,
				});
				if (!opened) throw new Error("chat_unavailable");
			}
			toast.success(t({ message: "Chat imported" }), {
				description: session.title ?? session.preview ?? undefined,
			});
			onOpenChange(false);
			onImported();
		} catch (error) {
			toast.error(t({ message: "Couldn't import the chat" }), {
				description: errorMessage(error, t({ message: "Unknown error" })),
			});
		} finally {
			setBusy(null);
		}
	};

	const listError = listing.error?.message;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						<Trans>Import a chat</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							Chats started outside Superset in this workspace's folder, for
							example in a terminal or in Zed. Pick one to continue it here.
						</Trans>
					</DialogDescription>
				</DialogHeader>
				<div className="relative">
					<Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						autoFocus
						className="pl-8"
						onChange={(event) => setQuery(event.target.value)}
						placeholder={t({ message: "Search chats" })}
						value={query}
					/>
				</div>
				{agents.length > 1 && (
					<div className="flex flex-wrap gap-1.5" role="radiogroup">
						{[ALL, ...agents].map((agent) => {
							const icon = agent === ALL ? null : getPresetIcon(agent, dark);
							const selected = agentFilter === agent;
							return (
								<button
									aria-pressed={selected}
									className={cn(
										"flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
										selected
											? "border-foreground/20 bg-foreground/[0.08] text-foreground"
											: "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
									)}
									key={agent}
									onClick={() => setAgentFilter(agent)}
									type="button"
								>
									{icon ? <img alt="" className="size-3.5" src={icon} /> : null}
									{agent === ALL ? <Trans>All</Trans> : labelFor(agent)}
									<span className="text-muted-foreground/70 tabular-nums">
										{agent === ALL
											? sessions.length
											: sessions.filter((session) => session.agent === agent)
													.length}
									</span>
								</button>
							);
						})}
					</div>
				)}
				<div className="-mx-2 min-h-40 flex-1 overflow-y-auto px-2">
					{listing.isPending ? (
						<div className="flex h-40 items-center justify-center">
							<Spinner className="size-4" />
						</div>
					) : listError ? (
						<p className="py-10 text-center text-muted-foreground text-sm">
							{listError === "session_list_unavailable" ? (
								<Trans>
									This build can't search chats yet. Update Superset to use it.
								</Trans>
							) : (
								<Trans>Couldn't read the chats on this Mac.</Trans>
							)}
						</p>
					) : visible.length === 0 ? (
						<p className="py-10 text-center text-muted-foreground text-sm">
							<Trans>No chats found in this folder.</Trans>
						</p>
					) : (
						<ul className="flex flex-col gap-1">
							{visible.map((session) => {
								const key = `${session.agent}:${session.sessionId}`;
								const icon = getPresetIcon(session.agent, dark);
								const account = accountName(session.accountSelection);
								const others = configs.filter(
									(config) =>
										config.presetId !== session.agent &&
										acpHarnessForPreset(config.presetId) &&
										config.resumeArgs?.length &&
										verified(config.presetId) &&
										verified(session.agent),
								);
								const canContinue = Boolean(chatConfig(session.agent));
								return (
									<li
										className="group flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-foreground/[0.04]"
										key={key}
									>
										{icon ? (
											<img alt="" className="size-5 shrink-0" src={icon} />
										) : null}
										<div className="min-w-0 flex-1">
											<p
												className={cn(
													"truncate text-sm",
													!session.title &&
														!session.preview &&
														"text-muted-foreground",
												)}
												title={session.preview ?? undefined}
											>
												{session.title ?? session.preview ?? (
													<Trans>Untitled chat</Trans>
												)}
											</p>
											<p className="truncate text-muted-foreground text-xs">
												{[
													formatRelativeTime(
														new Date(session.updatedAt ?? session.timestamp),
													),
													labelFor(session.agent),
													session.model,
													session.gitBranch,
													account,
													session.sessionId.slice(0, 8),
												]
													.filter(Boolean)
													.join(" · ")}
											</p>
										</div>
										{session.inSuperset && (
											<span className="shrink-0 rounded-full bg-foreground/[0.07] px-2 py-0.5 text-[10px] text-muted-foreground">
												<Trans>In Superset</Trans>
											</span>
										)}
										<div className="flex shrink-0 items-center">
											<Button
												className={cn(others.length > 0 && "rounded-r-none")}
												disabled={busy !== null || !canContinue}
												onClick={() => void run(session, session.agent)}
												size="sm"
												variant="secondary"
											>
												{busy === key ? (
													<Spinner className="size-3.5" />
												) : (
													<Trans>Continue</Trans>
												)}
											</Button>
											{others.length > 0 && (
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															aria-label={t({
																message: "Continue with another agent",
															})}
															className="rounded-l-none border-l border-background/40 px-1.5"
															disabled={busy !== null}
															size="sm"
															variant="secondary"
														>
															<ChevronDown className="size-3.5" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuLabel className="text-muted-foreground text-xs">
															<Trans>Continue with</Trans>
														</DropdownMenuLabel>
														{others.map((config) => {
															const otherIcon = getPresetIcon(
																config.presetId,
																dark,
															);
															return (
																<DropdownMenuItem
																	key={config.id}
																	onSelect={() =>
																		void run(session, config.presetId)
																	}
																>
																	{otherIcon ? (
																		<img
																			alt=""
																			className="size-4"
																			src={otherIcon}
																		/>
																	) : null}
																	{config.label}
																</DropdownMenuItem>
															);
														})}
													</DropdownMenuContent>
												</DropdownMenu>
											)}
										</div>
									</li>
								);
							})}
						</ul>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
