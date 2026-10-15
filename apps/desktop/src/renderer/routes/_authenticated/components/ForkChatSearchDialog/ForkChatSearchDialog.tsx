import { Trans, useLingui } from "@lingui/react/macro";
import { acpHarnessForPreset } from "@superset/chat/core";
import { formatRelativeTime } from "@superset/i18n/format";
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
import { Spinner } from "@superset/ui/spinner";
import { cn } from "@superset/ui/utils";
import { ArrowUpRight, ChevronDown, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { forkImportChoices } from "./forkImportChoices";
import {
	accountName,
	type ExternalSession,
	PORTABLE,
	sessionKey,
} from "./sessions";

const ALL = "all";

type ForkChatConfig = {
	id: string;
	presetId: string;
	label: string;
	resumeArgs?: string[] | null;
};

export function ForkChatSearchDialog({
	open,
	onOpenChange,
	sessions,
	isPending,
	isFetching,
	error,
	onRefresh,
	configs,
	verified,
	busyKey,
	currentWorkspaceId,
	onRun,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	sessions: ExternalSession[];
	isPending: boolean;
	isFetching: boolean;
	error: string | undefined;
	onRefresh: () => void;
	configs: ForkChatConfig[];
	verified: (presetId: string) => boolean;
	busyKey: string | null;
	currentWorkspaceId: string | null;
	onRun: (session: ExternalSession, configId: string) => void | Promise<void>;
}) {
	const { t } = useLingui();
	const dark = useIsDarkTheme();
	const [query, setQuery] = useState("");
	const [agentFilter, setAgentFilter] = useState(ALL);
	const chatConfig = (presetId: string) =>
		configs.find(
			(config) =>
				config.presetId === presetId && acpHarnessForPreset(config.presetId),
		);
	const agents = [...new Set(sessions.map((session) => session.agent))];
	const needle = query.trim().toLowerCase();
	const visible = useMemo(
		() =>
			sessions.filter(
				(session) =>
					(agentFilter === ALL || session.agent === agentFilter) &&
					(!needle ||
						`${session.title ?? ""} ${session.preview ?? ""} ${session.model ?? ""} ${session.gitBranch ?? ""} ${accountName(session.accountSelection) ?? ""} ${session.folder} ${session.sessionId}`
							.toLowerCase()
							.includes(needle)),
			),
		[sessions, agentFilter, needle],
	);
	const labelFor = (presetId: string) =>
		chatConfig(presetId)?.label ?? presetId;
	const homeOf = (session: ExternalSession) =>
		session.workspaceId ?? currentWorkspaceId;
	const canOpen = (session: ExternalSession) =>
		session.workspaceId !== null ||
		session.inProjectRoot ||
		PORTABLE.has(session.agent);

	const listError = error;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						<Trans>Find a chat</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							Find local chats across this project and its accounts. Open an
							existing chat or continue one started in a terminal.
						</Trans>
					</DialogDescription>
				</DialogHeader>
				<div className="flex items-center gap-2">
					<div className="relative min-w-0 flex-1">
						<Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
						<Input
							autoFocus
							className="pl-8"
							onChange={(event) => setQuery(event.target.value)}
							aria-label={t({ message: "Search chats" })}
							placeholder={t({ message: "Search chats" })}
							value={query}
						/>
					</div>
					<Button
						type="button"
						variant="outline"
						size="icon"
						aria-label={t({ message: "Refresh" })}
						title={t({ message: "Refresh" })}
						disabled={isFetching || busyKey !== null}
						onClick={() => void onRefresh()}
					>
						<RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
					</Button>
				</div>
				{agents.length > 1 && (
					<fieldset
						className="flex flex-wrap gap-1.5"
						aria-label={t({ message: "Agent" })}
					>
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
					</fieldset>
				)}
				<div className="-mx-2 min-h-40 flex-1 overflow-y-auto px-2">
					{isPending ? (
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
						<div className="space-y-3 py-10 text-center text-muted-foreground text-sm">
							<p>
								{sessions.length > 0 ? (
									<Trans>No results found.</Trans>
								) : (
									<Trans>No chats found in this project.</Trans>
								)}
							</p>
							{(needle || agentFilter !== ALL) && (
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										setQuery("");
										setAgentFilter(ALL);
									}}
								>
									<Trans>Clear filters</Trans>
								</Button>
							)}
						</div>
					) : (
						<ul className="flex flex-col gap-1">
							{visible.map((session) => {
								const key = sessionKey(session);
								const icon = getPresetIcon(session.agent, dark);
								const account = accountName(session.accountSelection);
								const others = forkImportChoices(configs, {
									sourceAgent: session.agent,
									canOpen: canOpen(session),
									hasWorkspace:
										session.workspaceId !== null || session.inProjectRoot,
									verified,
								});
								const canContinue =
									Boolean(session.terminalId || chatConfig(session.agent)) &&
									canOpen(session);
								const elsewhere = homeOf(session) !== currentWorkspaceId;
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
													elsewhere || session.workspaceId === null
														? session.folder.split("/").at(-1)
														: null,
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
												disabled={busyKey !== null || !canContinue}
												onClick={() =>
													void onRun(
														session,
														chatConfig(session.agent)?.id ?? "",
													)
												}
												size="sm"
												title={
													!canOpen(session)
														? t({
																message:
																	"Add this folder as a workspace to continue the chat",
															})
														: elsewhere
															? t({
																	message:
																		"Opens in the workspace of its folder",
																})
															: undefined
												}
												variant="secondary"
											>
												{busyKey === key ? (
													<Spinner className="size-3.5" />
												) : (
													<>
														{session.terminalId ? (
															<Trans>Open</Trans>
														) : (
															<Trans>Continue</Trans>
														)}
														{elsewhere && <ArrowUpRight className="size-3.5" />}
													</>
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
															disabled={busyKey !== null}
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
														{others.map(({ config, unavailable }) => {
															const otherIcon = getPresetIcon(
																config.presetId,
																dark,
															);
															return (
																<DropdownMenuItem
																	key={config.id}
																	disabled={unavailable !== null}
																	onSelect={() =>
																		void onRun(session, config.id)
																	}
																>
																	{otherIcon ? (
																		<img
																			alt=""
																			className="size-4"
																			src={otherIcon}
																		/>
																	) : null}
																	<span className="flex min-w-0 flex-col">
																		<span>{config.label}</span>
																		{unavailable && (
																			<span className="text-xs text-muted-foreground">
																				{unavailable === "chat"
																					? t({
																							message:
																								"This agent can't be opened as a chat.",
																						})
																					: unavailable === "folder"
																						? t({
																								message:
																									"Add this folder as a workspace to continue the chat",
																							})
																						: t({
																								message:
																									"Native handoff is unavailable for this agent pair or host.",
																							})}
																			</span>
																		)}
																	</span>
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
