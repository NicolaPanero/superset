import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { countLines, firstLine, userMessageText } from "@superset/chat/core";
import type { UserMessage } from "@superset/chat/protocol";
import {
	QueueItemAction,
	QueueItemActions,
	QueueItemContent,
} from "@superset/ui/ai-elements/queue";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import {
	CornerDownRight,
	FileTextIcon,
	ListEnd,
	Pencil,
	Trash2,
} from "lucide-react";
import { parseAttachmentTags } from "../../../../utils/attachmentTags";

export function QueuedPromptRow({
	rowKey,
	tabbable,
	prompt,
	actionable,
	pending = false,
	onEdit,
	onRemove,
	onSteer,
}: {
	rowKey: string;
	tabbable: boolean;
	prompt: UserMessage;
	actionable: boolean;
	pending?: boolean;
	onEdit: (prompt: UserMessage) => void;
	onRemove: (id: string) => void;
	onSteer: (id: string) => void;
}) {
	const { t } = useLingui();
	const { text, attachments, pastedTexts } = parseAttachmentTags(
		userMessageText(prompt),
	);
	const attachmentNames = [
		...attachments.map(
			(attachment) => attachment.path.split("/").pop() ?? attachment.path,
		),
		...prompt.content.flatMap((content) =>
			content.type === "attachment" ? [content.name] : [],
		),
	];
	const label =
		text ||
		(pastedTexts[0] ? firstLine(pastedTexts[0]) : attachmentNames.join(", "));

	return (
		<div
			aria-label={label}
			aria-selected={tabbable}
			className="group flex min-h-7 items-center gap-2 rounded-md py-0.5 pr-1 pl-2.5 text-sm outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-1 focus-visible:ring-ring"
			data-drawer-stop={rowKey}
			role="option"
			tabIndex={tabbable ? 0 : -1}
		>
			<ListEnd className="size-3.5 shrink-0 text-muted-foreground" />
			<QueueItemContent className="min-w-0 truncate text-foreground">
				{label}
			</QueueItemContent>
			{pastedTexts.map((pasted, index) => {
				const lines = countLines(pasted);
				return (
					<span
						className="flex shrink-0 items-center gap-1 text-muted-foreground text-xs"
						// biome-ignore lint/suspicious/noArrayIndexKey: pastes have no identity beyond their order
						key={index}
					>
						<FileTextIcon className="size-3.5" />
						{t({
							message: plural(lines, { one: "# line", other: "# lines" }),
						})}
					</span>
				);
			})}
			{actionable && (
				<QueueItemActions className="shrink-0 items-center">
					<Tooltip>
						<TooltipTrigger asChild>
							<QueueItemAction
								className="gap-1 px-1.5 py-0.5 font-normal text-xs opacity-100"
								disabled={pending}
								onClick={() => onSteer(prompt.id)}
							>
								<CornerDownRight className="size-3.5" />
								<Trans>Steer</Trans>
							</QueueItemAction>
						</TooltipTrigger>
						<TooltipContent>
							<Trans>Stop the agent and send this now</Trans>
						</TooltipContent>
					</Tooltip>
					<QueueItemAction
						aria-label={t({ message: "Remove queued message" })}
						className="size-6 opacity-100"
						disabled={pending}
						onClick={() => onRemove(prompt.id)}
					>
						<Trash2 className="size-3.5" />
					</QueueItemAction>
					<Tooltip>
						<TooltipTrigger asChild>
							<QueueItemAction
								aria-label={t({ message: "Edit" })}
								className="size-6 opacity-100"
								disabled={pending}
								onClick={() => onEdit(prompt)}
							>
								<Pencil className="size-3.5" />
							</QueueItemAction>
						</TooltipTrigger>
						<TooltipContent>
							<Trans>Edit</Trans>
						</TooltipContent>
					</Tooltip>
				</QueueItemActions>
			)}
		</div>
	);
}
