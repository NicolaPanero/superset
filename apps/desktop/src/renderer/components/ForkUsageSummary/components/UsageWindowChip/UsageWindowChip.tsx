import { Trans, useLingui } from "@lingui/react/macro";
import { formatPercent } from "@superset/i18n/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { LuRotateCcw } from "react-icons/lu";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import {
	formatResetIn,
	formatResetLabel,
} from "renderer/utils/usage/formatResetIn";
import {
	displayUsedPercent,
	usageTone,
	usageWindowShortLabel,
} from "../../utils/parseUsageWindow";
import { UsageBar } from "../UsageBar";

export function UsageWindowChip({
	window,
	dimmed = false,
	now = new Date(),
}: {
	window: UsageAccount["windows"][number];
	dimmed?: boolean;
	now?: Date;
}) {
	const { t } = useLingui();
	const short = usageWindowShortLabel(window.label);
	const used = formatPercent(displayUsedPercent(window.usedPercent) / 100, {
		maximumFractionDigits: 0,
	});
	const tone = usageTone(window.usedPercent);
	const resets = window.resetsAt
		? formatResetLabel(window.resetsAt, now)
		: null;
	const resetsIn =
		window.resetsAt && tone !== "ok"
			? formatResetIn(window.resetsAt, now)
			: null;
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="inline-flex shrink-0 cursor-default items-center gap-1 whitespace-nowrap">
					<span className="text-muted-foreground">{short}</span>
					<UsageBar
						className="w-9 shrink-0"
						usedPercent={window.usedPercent}
						label={t({ message: `${short}: ${used} used` })}
						dimmed={dimmed}
					/>
					<span
						className={cn(
							"tabular-nums",
							!resetsIn && "min-w-[2.25rem]",
							tone === "danger" && "text-destructive",
							tone === "warning" && "text-warning",
							tone === "ok" && "text-muted-foreground",
						)}
					>
						<Trans>{used} used</Trans>
					</span>
					{resetsIn && (
						<span className="inline-flex items-center gap-0.5 text-muted-foreground tabular-nums">
							<LuRotateCcw aria-hidden className="size-2.5" />
							{resetsIn}
						</span>
					)}
				</span>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				{resets ? `${window.label} · ${resets}` : window.label}
			</TooltipContent>
		</Tooltip>
	);
}
