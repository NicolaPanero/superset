import { Trans, useLingui } from "@lingui/react/macro";
import type { AgentMessage, UserMessage } from "@superset/chat/protocol";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { RotateCcw, Split } from "lucide-react";
import { useForkMessageActions } from "../../../../providers/ForkMessageActionsProvider";
import type { ChatForkTarget } from "../../../../types";
import { CopyButton } from "../../../CopyButton";
import { MessageTime } from "../MessageTime";
import { ForkMessagePreview } from "./components/ForkMessagePreview";

export function ForkMessageActions({
	item,
	text,
	onFork,
	canForkToWorktree = true,
	className,
	onRewind,
	canForkInWorkspace = true,
	forkFromHere = false,
	model,
}: {
	item: AgentMessage | UserMessage;
	text: string;
	onFork?: ((target: ChatForkTarget, fromItemId: string) => void) | undefined;
	canForkToWorktree?: boolean | undefined;
	className?: string;
	onRewind?: (() => void) | undefined;
	canForkInWorkspace?: boolean | undefined;
	forkFromHere?: boolean | undefined;
	model?: string | undefined;
}) {
	const { t } = useLingui();
	const actions = useForkMessageActions();
	const textBranch = actions?.textBranch;
	const native = actions?.nativeFork ?? (forkFromHere || !!onRewind);
	const busy = actions?.busy ?? false;
	const editReason = busy
		? t({ message: "Wait for the agent and queued work to finish." })
		: !native
			? t({
					message:
						"This agent does not support returning to a specific message.",
				})
			: item.kind === "user_message" &&
					item.content.some((part) => part.type !== "text")
				? t({ message: "Only text messages can be edited and restarted." })
				: !onRewind
					? t({ message: "This message cannot be used as a restart point." })
					: undefined;

	const atMs =
		item.kind === "user_message"
			? item.startedAtMs
			: (item.completedAtMs ?? item.startedAtMs);
	return (
		<div
			className={cn(
				"flex items-center gap-2 text-muted-foreground/60 opacity-70 transition-opacity focus-within:opacity-100 group-hover/message:opacity-100",
				className,
			)}
		>
			<Tooltip>
				<TooltipTrigger asChild>
					<span>
						{text && (
							<CopyButton label={t({ message: "Copy message" })} text={text} />
						)}
					</span>
				</TooltipTrigger>
				<TooltipContent>
					<Trans>Copy message</Trans>
				</TooltipContent>
			</Tooltip>
			{item.kind === "agent_message" && text && (
				<ForkMessagePreview text={text} />
			)}
			{(onFork || textBranch) && (
				<DropdownMenu>
					<Tooltip>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger
								disabled={busy}
								aria-label={
									native
										? t({ message: "Fork from here" })
										: t({ message: "Branch this conversation" })
								}
								className="rounded p-1 transition-colors hover:bg-secondary hover:text-foreground"
							>
								<Split className="size-3.5" />
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<TooltipContent>
							{native ? (
								<Trans>Fork from here</Trans>
							) : (
								<Trans>Branch this conversation</Trans>
							)}
						</TooltipContent>
					</Tooltip>
					<DropdownMenuContent align="start" className="w-72">
						<DropdownMenuItem
							className="flex-col items-start gap-0.5"
							disabled={
								busy || (native ? !canForkInWorkspace || !onFork : !textBranch)
							}
							onSelect={() =>
								native ? onFork?.("workspace", item.id) : textBranch?.(item.id)
							}
						>
							<span className="text-xs">
								{native ? (
									<Trans>Branch in this workspace</Trans>
								) : (
									<Trans>New chat from loaded messages</Trans>
								)}
							</span>
							<span className="text-[11px] text-muted-foreground">
								{native ? (
									<Trans>
										The agent copies the conversation; the branch opens here
									</Trans>
								) : (
									<Trans>
										Copies message text only. Tool state and files are not
										restored.
									</Trans>
								)}
							</span>
						</DropdownMenuItem>
						{canForkToWorktree && onFork && (
							<DropdownMenuItem
								className="flex-col items-start gap-0.5"
								onSelect={() => onFork("worktree", item.id)}
							>
								<span className="text-xs">
									<Trans>Branch in a new worktree</Trans>
								</span>
								<span className="text-[11px] text-muted-foreground">
									<Trans>
										A new workspace off this branch, with the conversation
										handed to a fresh agent
									</Trans>
								</span>
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
			{(onRewind || (actions && item.kind === "user_message")) && (
				<Tooltip>
					<TooltipTrigger asChild>
						<span tabIndex={editReason ? 0 : undefined}>
							<button
								type="button"
								aria-label={t({ message: "Edit and restart from here" })}
								disabled={!!editReason}
								title={editReason}
								className="rounded p-1 transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
								onClick={onRewind}
							>
								<RotateCcw className="size-3.5" />
							</button>
						</span>
					</TooltipTrigger>
					<TooltipContent>
						{editReason ?? <Trans>Edit and restart from here</Trans>}
					</TooltipContent>
				</Tooltip>
			)}
			{model && (
				<span className="max-w-48 truncate text-[11px]" title={model}>
					{model}
				</span>
			)}
			<MessageTime atMs={atMs} />
		</div>
	);
}
