import { Trans, useLingui } from "@lingui/react/macro";
import { formatPercent } from "@superset/i18n/format";
import { cn } from "@superset/ui/utils";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import { formatResetLabel } from "renderer/utils/usage/formatResetIn";
import {
	displayUsedPercent,
	parseUsageWindow,
	usageTone,
} from "../../utils/parseUsageWindow";
import { UsageBar } from "../UsageBar";

export function UsageWindowRow({
	window,
	dimmed = false,
}: {
	window: UsageAccount["windows"][number];
	dimmed?: boolean;
}) {
	const { t } = useLingui();
	const parsed = parseUsageWindow(window.label);
	const title =
		parsed.kind === "session"
			? (() => {
					const hours = parsed.hours;
					const scope = parsed.scope;
					return scope
						? t({ message: `Session (${hours}h) · ${scope}` })
						: t({ message: `Session (${hours}h)` });
				})()
			: parsed.kind === "weekly"
				? (() => {
						const scope = parsed.scope;
						return scope
							? t({ message: `Weekly · ${scope}` })
							: t({ message: "Weekly" });
					})()
				: parsed.label;
	const percent = displayUsedPercent(window.usedPercent);
	const used = formatPercent(percent / 100, { maximumFractionDigits: 0 });
	const tone = usageTone(window.usedPercent);
	return (
		<div className="space-y-1">
			<div className="flex items-baseline justify-between gap-3">
				<span className="truncate text-foreground">{title}</span>
				<span className="shrink-0 text-[10px] text-muted-foreground">
					{window.resetsAt ? (
						formatResetLabel(window.resetsAt, new Date())
					) : (
						<Trans>Reset time unavailable</Trans>
					)}
				</span>
			</div>
			<div className="flex items-center gap-2">
				<UsageBar
					className="flex-1"
					usedPercent={window.usedPercent}
					label={t({ message: `${title}: ${used} used` })}
					dimmed={dimmed}
				/>
				<span
					className={cn(
						"w-[4.5rem] shrink-0 text-right tabular-nums",
						tone === "danger" && "text-red-500",
						tone === "warning" && "text-amber-500",
						tone === "ok" && "text-muted-foreground",
					)}
				>
					<Trans>{used} used</Trans>
				</span>
			</div>
		</div>
	);
}
