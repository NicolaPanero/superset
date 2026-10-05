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
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { workspaceTrpc } from "@superset/workspace-client";
import { History } from "lucide-react";
import { useRef, useState } from "react";
import type { CreateNewAgentSession } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useAgentSessionLauncher/useAgentSessionLauncher";

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
	const groups = edges.filter(
		(edge, index) =>
			edges.findIndex((other) => other.sourceNodeId === edge.sourceNodeId) ===
			index,
	);

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
				<DialogContent className="sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>
							<Trans>Session lineage</Trans>
						</DialogTitle>
						<DialogDescription>
							<Trans>
								Native handoffs saved locally. Each session can have several
								children.
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
						<p className="text-sm text-muted-foreground">
							<Trans>Loading session lineage…</Trans>
						</p>
					) : edges.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							<Trans>No native handoffs recorded in this workspace yet.</Trans>
						</p>
					) : (
						<div className="max-h-[60vh] overflow-y-auto space-y-4 pr-1">
							{groups.map((group) => (
								<section
									key={group.sourceNodeId}
									className="rounded-md border p-3"
								>
									<div className="flex flex-wrap items-start justify-between gap-2">
										<div className="min-w-0 flex-1">
											<p className="text-sm font-medium">
												{group.source.label}
											</p>
											<code className="block break-all text-xs text-muted-foreground">
												{group.source.sessionId}
											</code>
										</div>
										<div className="flex gap-1">
											<Button
												size="sm"
												variant="outline"
												disabled={Boolean(busyNodeId)}
												onClick={() => void openSession(group.sourceNodeId)}
											>
												<Trans>Open parent</Trans>
											</Button>
											<Button
												size="sm"
												variant="ghost"
												disabled={Boolean(busyNodeId)}
												onClick={() =>
													void openSession(group.sourceNodeId, true)
												}
											>
												<Trans>Continue with…</Trans>
											</Button>
										</div>
									</div>
									<ul className="ml-2 mt-3 space-y-3 border-l pl-4">
										{edges
											.filter(
												(edge) => edge.sourceNodeId === group.sourceNodeId,
											)
											.map((edge) => (
												<li key={edge.id} className="space-y-2">
													<p className="text-xs text-muted-foreground">
														<Trans>Native Handoff</Trans> ·{" "}
														{formatDateTime(edge.createdAt)}
													</p>
													<div className="flex flex-wrap items-start justify-between gap-2">
														<div className="min-w-0 flex-1">
															<p className="text-sm font-medium">
																{edge.target.label}
															</p>
															<code className="block break-all text-xs text-muted-foreground">
																{edge.target.sessionId}
															</code>
														</div>
														<div className="flex gap-1">
															<Button
																size="sm"
																variant="outline"
																disabled={Boolean(busyNodeId)}
																onClick={() =>
																	void openSession(edge.targetNodeId)
																}
															>
																<Trans>Open child</Trans>
															</Button>
															<Button
																size="sm"
																variant="ghost"
																disabled={Boolean(busyNodeId)}
																onClick={() =>
																	void openSession(edge.targetNodeId, true)
																}
															>
																<Trans>Continue with…</Trans>
															</Button>
														</div>
													</div>
													{edge.warnings.length > 1 && (
														<p className="text-xs text-muted-foreground">
															<Trans>
																Some agent-specific metadata could not be
																transferred.
															</Trans>
														</p>
													)}
												</li>
											))}
									</ul>
								</section>
							))}
							{query.hasNextPage && (
								<Button
									variant="outline"
									disabled={query.isFetchingNextPage}
									onClick={() => void query.fetchNextPage()}
								>
									<Trans>Load more</Trans>
								</Button>
							)}
						</div>
					)}
					{busyNodeId && (
						<output className="text-sm text-muted-foreground">
							<Trans>Opening native session…</Trans>
						</output>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}
