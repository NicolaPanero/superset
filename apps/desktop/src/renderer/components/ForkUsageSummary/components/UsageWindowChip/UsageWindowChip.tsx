import { useLingui } from "@lingui/react/macro";
import { formatPercent } from "@superset/i18n/format";
import { cn } from "@superset/ui/utils";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import {
	displayUsedPercent,
	usageTone,
	usageWindowShortLabel,
} from "../../utils/parseUsageWindow";
import { UsageBar } from "../UsageBar";

export function UsageWindowChip({
	window,
	dimmed = false,
}: {
	window: UsageAccount["windows"][number];
	dimmed?: boolean;
}) {
	const { t } = useLingui();
	const short = usageWindowShortLabel(window.label);
	const used = formatPercent(displayUsedPercent(window.usedPercent) / 100, {
		maximumFractionDigits: 0,
	});
	const tone = usageTone(window.usedPercent);
	return (
		<span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
			<span className="text-muted-foreground">{short}</span>
			<UsageBar
				className="w-9 shrink-0"
				usedPercent={window.usedPercent}
				label={t({ message: `${short}: ${used} used` })}
				dimmed={dimmed}
			/>
			<span
				className={cn(
					"min-w-[2.25rem] tabular-nums",
					tone === "danger" && "text-destructive",
					tone === "warning" && "text-warning",
					tone === "ok" && "text-muted-foreground",
				)}
			>
				{used}
			</span>
		</span>
	);
}
