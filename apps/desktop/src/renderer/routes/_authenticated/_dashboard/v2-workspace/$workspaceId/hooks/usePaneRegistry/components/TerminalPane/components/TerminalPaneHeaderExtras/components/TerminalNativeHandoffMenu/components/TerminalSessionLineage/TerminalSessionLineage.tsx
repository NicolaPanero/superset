import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Spinner } from "@superset/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { ArrowRightLeft, History, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import type { CreateNewAgentSession } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useAgentSessionLauncher/useAgentSessionLauncher";
import { lineageRows } from "./utils/lineageRows";

interface TerminalSessionLineageProps {
	workspaceId: string;
	onCreateNewAgentSession: CreateNewAgentSession;
	onContinueSession: (terminalId: string) => void;
}

export function TerminalSessionLineage({
	workspaceId,
	onCreateNewAgentSession,
	onContinueSession,
}: TerminalSessionLineageProps) {
	const { t } = useLingui();
	const { formatDateTime } = useFormat();
	const dark = useIsDarkTheme();
	const [open, setOpen] = useState(false);
	const [busyNodeId, setBusyNodeId] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);
	const attempt = useRef<{ nodeId: string; transferId: string } | null>(null);
	const prepareResume =
		workspaceTrpc.sessionTransfer.prepareResume.useMutation();
	const query = workspaceTrpc.sessionTransfer.lineage.useInfiniteQuery(
		{ workspaceId, limit: 25 },
		{
			enabled: open,
			retry: false,
			getNextPageParam: (page) => page.nextCursor ?? undefined,
		},
	);
	const edges = query.data?.pages.flatMap((page) => page.items) ?? [];
	const conversations = lineageRows(edges);

	const openSession = async (nodeId: string, continueSession = false) => {
		setBusyNodeId(nodeId);
		setFailed(false);
		if (attempt.current?.nodeId !== nodeId)
			attempt.current = { nodeId, transferId: crypto.randomUUID() };
		try {
			const prepared = await prepareResume.mutateAsync({
				workspaceId,
				...attempt.current,
			});
			const result = await onCreateNewAgentSession({
				configId: prepared.configId,
				placement: "new-tab",
				prompt: "",
				nativeTransferId: prepared.transferId,
			});
			if (!result) {
				setFailed(true);
				return;
			}
			attempt.current = null;
			setOpen(false);
			if (continueSession) onContinueSession(result.terminalId);
		} catch {
			setFailed(true);
		} finally {
			setBusyNodeId(null);
		}
	};

	return (
		<>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label={t({ message: "Session lineage" })}
						onClick={() => {
							setOpen(true);
							setFailed(false);
							void query.refetch();
						}}
						className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
					>
						<History className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<Trans>Session lineage</Trans>
				</TooltipContent>
			</Tooltip>
			<Dialog
				open={open}
				onOpenChange={(next) => {
					if (!busyNodeId) setOpen(next);
				}}
			>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>
							<Trans>Session lineage</Trans>
						</DialogTitle>
						<DialogDescription>
							<Trans>
								Conversations moved between agents in this workspace.
							</Trans>
						</DialogDescription>
					</DialogHeader>
					{failed && (
						<p role="alert" className="text-sm text-destructive">
							<Trans>
								Couldn't reopen this session. Check that its agent configuration
								and native session still exist.
							</Trans>
						</p>
					)}
					{query.isError ? (
						<div className="flex items-center justify-between gap-2 text-sm">
							<p role="alert">
								<Trans>Couldn't load session lineage.</Trans>
							</p>
							<Button variant="outline" onClick={() => void query.refetch()}>
								<Trans>Retry</Trans>
							</Button>
						</div>
					) : query.isLoading ? (
						<div className="flex h-24 items-center justify-center">
							<Spinner className="size-4" />
						</div>
					) : edges.length === 0 ? (
						<p className="py-6 text-center text-sm text-muted-foreground">
							<Trans>No native handoffs recorded in this workspace yet.</Trans>
						</p>
					) : (
						<div className="-mx-1 max-h-[60vh] space-y-2 overflow-y-auto px-1">
							{conversations.map((rows) => (
								<ol
									key={rows[0]?.nodeId}
									className="rounded-lg border border-border/70 py-1"
								>
									{rows.map((row, index) => {
										const icon = getPresetIcon(row.agent, dark);
										const last = index === rows.length - 1;
										const busy = busyNodeId === row.nodeId;
										return (
											<li
												key={`${row.nodeId}:${index}`}
												className="group relative flex h-9 items-center gap-2 pr-1.5"
												style={{ paddingLeft: 12 + row.depth * 16 }}
											>
												{!last && (
													<span
														aria-hidden="true"
														className="absolute top-6 bottom-[-12px] w-px bg-border"
														style={{ left: 20 + row.depth * 16 }}
													/>
												)}
												{icon ? (
													<img
														alt=""
														className="relative size-4 shrink-0"
														src={icon}
													/>
												) : (
													<span className="relative size-4 shrink-0 rounded-full bg-muted" />
												)}
												<span className="shrink-0 text-sm">{row.label}</span>
												<Tooltip>
													<TooltipTrigger asChild>
														<code className="min-w-0 truncate text-[11px] text-muted-foreground">
															{row.sessionId.slice(0, 8)}
														</code>
													</TooltipTrigger>
													<TooltipContent side="top">
														<code>{row.sessionId}</code>
													</TooltipContent>
												</Tooltip>
												{row.warning && (
													<Tooltip>
														<TooltipTrigger asChild>
															<TriangleAlert
																aria-label={t({
																	message:
																		"Some agent-specific metadata could not be transferred.",
																})}
																className="size-3 shrink-0 text-amber-500/80"
															/>
														</TooltipTrigger>
														<TooltipContent side="top">
															<Trans>
																Some agent-specific metadata could not be
																transferred.
															</Trans>
														</TooltipContent>
													</Tooltip>
												)}
												{row.latest && (
													<span className="shrink-0 rounded-full bg-foreground/[0.07] px-1.5 py-px text-[10px] text-muted-foreground">
														<Trans>Latest</Trans>
													</span>
												)}
												<span className="flex-1" />
												{row.handedOverAt !== null && (
													<span
														className={cn(
															"shrink-0 text-[11px] text-muted-foreground/80 tabular-nums",
															!busy && "group-hover:hidden",
															busy && "hidden",
														)}
													>
														{formatDateTime(row.handedOverAt)}
													</span>
												)}
												<span
													className={cn(
														"shrink-0 items-center gap-0.5",
														busy ? "flex" : "hidden group-hover:flex",
													)}
												>
													{busy ? (
														<Spinner className="mx-2 size-3.5" />
													) : (
														<>
															<Button
																className="h-7 px-2 text-xs"
																disabled={Boolean(busyNodeId)}
																onClick={() => void openSession(row.nodeId)}
																size="sm"
																variant="ghost"
															>
																<Trans>Open</Trans>
															</Button>
															<Tooltip>
																<TooltipTrigger asChild>
																	<Button
																		aria-label={t({
																			message: "Continue with…",
																		})}
																		className="size-7 p-0"
																		disabled={Boolean(busyNodeId)}
																		onClick={() =>
																			void openSession(row.nodeId, true)
																		}
																		size="sm"
																		variant="ghost"
																	>
																		<ArrowRightLeft className="size-3.5" />
																	</Button>
																</TooltipTrigger>
																<TooltipContent side="top">
																	<Trans>Continue with…</Trans>
																</TooltipContent>
															</Tooltip>
														</>
													)}
												</span>
											</li>
										);
									})}
								</ol>
							))}
							{query.hasNextPage && (
								<Button
									className="w-full"
									variant="ghost"
									disabled={query.isFetchingNextPage}
									onClick={() => void query.fetchNextPage()}
								>
									<Trans>Load more</Trans>
								</Button>
							)}
						</div>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}
