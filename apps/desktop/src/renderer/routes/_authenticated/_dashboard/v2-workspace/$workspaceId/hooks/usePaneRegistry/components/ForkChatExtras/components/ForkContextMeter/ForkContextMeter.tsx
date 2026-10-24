import { Trans, useLingui } from "@lingui/react/macro";
import { formatCompactNumber, formatPercent } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { useEffect, useState } from "react";
import { useForkContextUsage } from "../../../ChatSession/providers/ForkContextUsageProvider";
import { ForkContextBreakdown } from "./components/ForkContextBreakdown";

const RADIUS = 10.5;
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
			enabled: open && claude && !!context && !running,
			staleTime: 0,
			retry: false,
			placeholderData: (previous) => previous,
		},
	);
	const { refetch } = breakdown;
	useEffect(() => {
		if (open && claude && !running && usage) void refetch();
	}, [open, claude, running, usage, refetch]);
	const ratio = usage ? Math.min(1, usage.used / usage.size) : 0;
	const percent = formatPercent(ratio, { maximumFractionDigits: 0 });
	const amounts = usage
		? `${formatCompactNumber(usage.used)} / ${formatCompactNumber(usage.size)}`
		: "—";
	const unavailable = t({ message: "Context usage unavailable" });
	const data = breakdown.data?.usage ?? null;
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={
						usage ? t({ message: `Context ${percent} used` }) : unavailable
					}
					title={usage ? `${percent} · ${amounts}` : unavailable}
					className={cn(
						"relative grid size-7 shrink-0 place-items-center rounded-lg tabular-nums outline-none transition-colors hover:bg-foreground/[0.07] focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-foreground/[0.07]",
						tone(ratio),
					)}
				>
					<svg aria-hidden="true" viewBox="0 0 24 24" className="size-6">
						<g transform="rotate(-90 12 12)">
							<circle
								cx="12"
								cy="12"
								r={RADIUS}
								fill="none"
								stroke="currentColor"
								strokeOpacity={0.2}
								strokeDasharray={usage ? undefined : "2 2"}
								strokeWidth={1.5}
							/>
							{usage && (
								<circle
									cx="12"
									cy="12"
									r={RADIUS}
									fill="none"
									stroke="currentColor"
									strokeWidth={1.5}
									strokeLinecap="round"
									strokeDasharray={CIRCUMFERENCE}
									strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
								/>
							)}
						</g>
						{usage && (
							<text
								x="12"
								y="12"
								dominantBaseline="central"
								textAnchor="middle"
								textLength={percent.length > 3 ? 15 : undefined}
								lengthAdjust="spacingAndGlyphs"
								className="fill-current text-[7px] font-semibold"
							>
								{percent}
							</text>
						)}
					</svg>
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
					{usage ? (
						<Trans>{percent} used</Trans>
					) : (
						<Trans>Context usage will appear when the agent reports it.</Trans>
					)}
				</p>
				{data ? (
					<ForkContextBreakdown usage={data} />
				) : usage ? (
					<div className="h-1.5 overflow-hidden rounded-full bg-muted">
						<div
							className="h-full rounded-full bg-blue-500"
							style={{ width: `${ratio * 100}%` }}
						/>
					</div>
				) : null}
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
				{usage && !claude && (
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
