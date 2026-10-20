import { Trans, useLingui } from "@lingui/react/macro";
import { formatCompactNumber, formatPercent } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { useEffect, useState } from "react";
import { useForkContextUsage } from "../../../ChatSession/providers/ForkContextUsageProvider";
import { ForkContextBreakdown } from "./components/ForkContextBreakdown";

const RADIUS = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function tone(ratio: number) {
	if (ratio >= 0.9) return "text-red-500";
	if (ratio >= 0.7) return "text-amber-500";
	return "text-muted-foreground";
}

/** The composer's context ring; the breakdown loads only while it is open. */
export function ForkContextMeter({
	terminalId,
	agent,
}: {
	terminalId: string;
	agent: string | null;
}) {
	const { t } = useLingui();
	const context = useForkContextUsage();
	const [open, setOpen] = useState(false);
	const usage = context?.usage;
	const running = context?.running ?? false;
	const claude = agent === "claude";
	const breakdown = workspaceTrpc.agents.contextBreakdown.useQuery(
		{ terminalId },
		{
			enabled: open && claude && !running,
			staleTime: 0,
			retry: false,
			placeholderData: (previous) => previous,
		},
	);
	const { refetch } = breakdown;
	useEffect(() => {
		if (open && claude && !running && usage) void refetch();
	}, [open, claude, running, usage, refetch]);
	if (!usage) return null;
	const ratio = Math.min(1, usage.used / usage.size);
	const percent = formatPercent(ratio, { maximumFractionDigits: 0 });
	const amounts = `${formatCompactNumber(usage.used)} / ${formatCompactNumber(usage.size)}`;
	const data = breakdown.data?.usage ?? null;
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={t({ message: `Context ${percent} used` })}
					title={`${percent} · ${amounts}`}
					className={cn(
						"flex h-7 shrink-0 items-center gap-1 rounded-lg px-1.5 text-[11px] tabular-nums outline-none transition-colors hover:bg-foreground/[0.07] focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-foreground/[0.07]",
						tone(ratio),
					)}
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 16 16"
						className="size-4 -rotate-90"
					>
						<circle
							cx="8"
							cy="8"
							r={RADIUS}
							fill="none"
							stroke="currentColor"
							strokeOpacity={0.2}
							strokeWidth={2}
						/>
						<circle
							cx="8"
							cy="8"
							r={RADIUS}
							fill="none"
							stroke="currentColor"
							strokeWidth={2}
							strokeLinecap="round"
							strokeDasharray={CIRCUMFERENCE}
							strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
						/>
					</svg>
					{ratio >= 0.7 && <span>{percent}</span>}
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" side="top" className="w-80 space-y-3 p-3">
				<div className="flex items-baseline justify-between">
					<p className="text-sm font-medium">
						<Trans>Context</Trans>
					</p>
					<p className="text-xs tabular-nums text-muted-foreground">
						{amounts}
					</p>
				</div>
				<p className={cn("text-xs", tone(ratio))}>
					<Trans>{percent} used</Trans>
				</p>
				{data ? (
					<ForkContextBreakdown usage={data} />
				) : (
					<div className="h-1.5 overflow-hidden rounded-full bg-muted">
						<div
							className="h-full rounded-full bg-blue-500"
							style={{ width: `${ratio * 100}%` }}
						/>
					</div>
				)}
				{claude && running && (
					<p className="text-[11px] text-muted-foreground">
						<Trans>The breakdown updates when the agent finishes.</Trans>
					</p>
				)}
				{claude && !running && !data && breakdown.isFetching && (
					<p className="text-[11px] text-muted-foreground">
						<Trans>Loading breakdown…</Trans>
					</p>
				)}
				{!claude && (
					<p className="text-[11px] text-muted-foreground">
						<Trans>A breakdown by category is available for Claude.</Trans>
					</p>
				)}
				{context?.compact && (
					<div className="flex items-center justify-between gap-2 border-t pt-2">
						{data?.autoCompactThreshold &&
						data.isAutoCompactEnabled !== false ? (
							<span className="text-[11px] text-muted-foreground">
								<Trans>
									{formatCompactNumber(
										Math.max(0, data.autoCompactThreshold - data.totalTokens),
									)}{" "}
									until auto-compact
								</Trans>
							</span>
						) : (
							<span />
						)}
						<Button
							size="xs"
							variant="secondary"
							disabled={running}
							onClick={() => {
								setOpen(false);
								context.compact?.();
							}}
						>
							<Trans>Compact session</Trans>
						</Button>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
