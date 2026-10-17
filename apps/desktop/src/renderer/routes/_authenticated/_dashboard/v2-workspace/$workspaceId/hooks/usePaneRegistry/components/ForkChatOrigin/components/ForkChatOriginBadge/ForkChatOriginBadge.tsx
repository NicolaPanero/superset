import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Info, Undo2 } from "lucide-react";
import type { ForkChatOriginInfo } from "../../types";

export function ForkChatOriginBadge({
	origin,
}: {
	origin: ForkChatOriginInfo;
}) {
	const { t } = useLingui();
	const continuedFrom = (source: string) =>
		t({ message: `Continued from ${source}` });
	const label = origin.label;
	const back = t({ message: `Back to ${label}` });
	return (
		<div className="flex min-w-0 items-center gap-0.5">
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="flex min-w-0 cursor-default items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground">
						<Info className="size-3.5 shrink-0" />
						<span className="hidden truncate @min-[420px]/pane-header:inline">
							{continuedFrom(label)}
						</span>
					</span>
				</TooltipTrigger>
				<TooltipContent side="bottom" className="max-w-72">
					<p>
						{continuedFrom(origin.email ? `${label} · ${origin.email}` : label)}
					</p>
					<p className="opacity-70">
						{origin.summaryOnly ? (
							<Trans>This agent received the messages so far.</Trans>
						) : (
							<Trans>This agent received the whole conversation so far.</Trans>
						)}
					</p>
				</TooltipContent>
			</Tooltip>
			{origin.onReturn && (
				<button
					type="button"
					aria-label={back}
					title={back}
					onClick={origin.onReturn}
					className="flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground"
				>
					<Undo2 className="size-3.5" />
					<span className="hidden @min-[320px]/pane-header:inline">{back}</span>
				</button>
			)}
		</div>
	);
}
