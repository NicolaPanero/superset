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
import type { ChatForkTarget } from "../../../../types";
import { CopyButton } from "../../../CopyButton";
import { MessageTime } from "../MessageTime";

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
	const atMs =
		item.kind === "user_message"
			? item.startedAtMs
			: (item.completedAtMs ?? item.startedAtMs);
	return (
		<div
			className={cn(
				"flex items-center gap-2 text-muted-foreground/60 opacity-0 transition-opacity focus-within:opacity-100 group-hover/message:opacity-100",
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
			{onFork && (
				<DropdownMenu>
					<Tooltip>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger
								aria-label={
									forkFromHere
										? t({ message: "Fork from here" })
										: t({ message: "Branch this conversation" })
								}
								className="rounded p-1 transition-colors hover:bg-secondary hover:text-foreground"
							>
								<Split className="size-3.5" />
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<TooltipContent>
							{forkFromHere ? (
								<Trans>Fork from here</Trans>
							) : (
								<Trans>Branch this conversation</Trans>
							)}
						</TooltipContent>
					</Tooltip>
					<DropdownMenuContent align="start" className="w-72">
						<DropdownMenuItem
							className="flex-col items-start gap-0.5"
							disabled={!canForkInWorkspace}
							onSelect={() => onFork("workspace", item.id)}
						>
							<span className="text-xs">
								<Trans>Branch in this workspace</Trans>
							</span>
							<span className="text-[11px] text-muted-foreground">
								<Trans>
									The agent copies the conversation; the branch opens here
								</Trans>
							</span>
						</DropdownMenuItem>
						{canForkToWorktree && (
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
			{onRewind && (
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label={t({ message: "Rewind from here" })}
							className="rounded p-1 transition-colors hover:bg-secondary hover:text-foreground"
							onClick={onRewind}
						>
							<RotateCcw className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent>
						<Trans>Rewind from here</Trans>
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
