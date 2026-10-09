import { Trans, useLingui } from "@lingui/react/macro";
import { formatAge } from "@superset/i18n/format";
import type { WorkspaceStore } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { Spinner } from "@superset/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { MessageSquare, Square } from "lucide-react";
import { useState } from "react";
import type { StoreApi } from "zustand/vanilla";
import {
	type BackgroundChat,
	useForkBackgroundChats,
} from "../../../../hooks/useForkBackgroundChats";
import type { PaneViewerData } from "../../../../types";
import { MenuGroup } from "../MenuGroup";

export function ForkBackgroundChatsGroup({
	workspaceId,
	store,
	onOpened,
}: {
	workspaceId: string;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	onOpened: () => void;
}) {
	const { t } = useLingui();
	const { chats, reopen, stop } = useForkBackgroundChats(workspaceId);
	const [stopping, setStopping] = useState<ReadonlySet<string>>(new Set());
	if (chats.length === 0) return null;
	const now = Date.now();

	const handleStop = (chat: BackgroundChat) => {
		setStopping((current) => new Set(current).add(chat.terminalId));
		void stop(chat)
			.catch(() => toast.error(t({ message: "Couldn't stop the chat" })))
			.finally(() =>
				setStopping((current) => {
					const next = new Set(current);
					next.delete(chat.terminalId);
					return next;
				}),
			);
	};

	return (
		<MenuGroup title={<Trans>Background chats</Trans>}>
			<div className="max-h-48 overflow-y-auto">
				{chats.map((chat) => {
					const label =
						chat.paneData.chatTitle || chat.title || t({ message: "Chat" });
					const busy = stopping.has(chat.terminalId);
					return (
						<div
							key={chat.terminalId}
							className={cn(
								"group flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs transition-colors hover:bg-accent",
								busy && "opacity-50",
							)}
						>
							<button
								type="button"
								onClick={() => {
									onOpened();
									reopen(store, chat);
								}}
								className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-1 focus-visible:ring-ring"
							>
								<MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
								<span className="min-w-0 flex-1">
									<span className="block truncate text-foreground">
										{label}
									</span>
									{chat.paneData.agent?.id && (
										<span className="block truncate text-[11px] text-muted-foreground">
											{chat.paneData.agent.id}
										</span>
									)}
								</span>
								<span className="shrink-0 text-[11px] text-muted-foreground/70 tabular-nums">
									{formatAge(chat.parkedAt, now)}
								</span>
							</button>
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										aria-label={t({ message: `Stop ${label}` })}
										disabled={busy}
										onClick={() => handleStop(chat)}
										className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground disabled:pointer-events-none"
									>
										{busy ? (
											<Spinner className="size-3" />
										) : (
											<Square className="size-2.5 fill-current" />
										)}
									</button>
								</TooltipTrigger>
								<TooltipContent side="top">
									<Trans>Stop</Trans>
								</TooltipContent>
							</Tooltip>
						</div>
					);
				})}
			</div>
		</MenuGroup>
	);
}
