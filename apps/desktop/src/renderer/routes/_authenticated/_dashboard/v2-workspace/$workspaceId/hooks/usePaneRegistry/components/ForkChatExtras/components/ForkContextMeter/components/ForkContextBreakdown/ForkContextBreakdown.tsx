import { Trans } from "@lingui/react/macro";
import { formatCompactNumber, formatPercent } from "@superset/i18n/format";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { LuChevronRight } from "react-icons/lu";

interface Category {
	name: string;
	tokens: number;
	kind?: "used" | "free" | "buffer" | "deferred";
	isDeferred?: boolean;
}

export interface ForkContextBreakdownData {
	categories: Category[];
	totalTokens: number;
	maxTokens: number;
	memoryFiles?: { path: string; tokens: number }[];
	mcpTools?: { name: string; serverName: string; tokens: number }[];
}

const SWATCHES: [RegExp, string][] = [
	[/message/i, "bg-blue-500"],
	[/mcp/i, "bg-emerald-500"],
	[/system tool|^tools/i, "bg-orange-500"],
	[/skill/i, "bg-amber-500"],
	[/agent/i, "bg-violet-500"],
	[/memory/i, "bg-stone-400"],
	[/system prompt/i, "bg-stone-500"],
];

function swatch(category: Category) {
	if (category.kind === "free") return "bg-muted";
	if (category.kind === "buffer") return "bg-stone-600";
	if (category.kind === "deferred" || category.isDeferred)
		return "bg-stone-700";
	return (
		SWATCHES.find(([pattern]) => pattern.test(category.name))?.[1] ??
		"bg-sky-400"
	);
}

function deferred(category: Category) {
	return category.kind === "deferred" || category.isDeferred === true;
}

function Details({
	label,
	count,
	children,
}: {
	label: ReactNode;
	count: number;
	children: ReactNode;
}) {
	if (!count) return null;
	return (
		<Collapsible>
			<CollapsibleTrigger className="group flex w-full items-center gap-1.5 py-0.5 text-left text-xs text-muted-foreground hover:text-foreground">
				<LuChevronRight className="size-3 transition-transform group-data-[state=open]:rotate-90" />
				<span className="flex-1">{label}</span>
				<span className="tabular-nums">{count}</span>
			</CollapsibleTrigger>
			<CollapsibleContent className="max-h-40 space-y-0.5 overflow-y-auto pt-1 pl-4.5">
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
}

function Row({ name, tokens }: { name: string; tokens: number }) {
	return (
		<div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
			<span className="min-w-0 flex-1 truncate" title={name}>
				{name}
			</span>
			<span className="tabular-nums">{formatCompactNumber(tokens)}</span>
		</div>
	);
}

/** Claude's /context categories: a stacked bar, rows, then tool and file lists. */
export function ForkContextBreakdown({
	usage,
}: {
	usage: ForkContextBreakdownData;
}) {
	const max = usage.maxTokens || 1;
	const inWindow = usage.categories.filter(
		(category) => !deferred(category) && category.tokens > 0,
	);
	const outside = usage.categories.filter(
		(category) => deferred(category) && category.tokens > 0,
	);
	return (
		<div className="space-y-3">
			<div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
				{inWindow.map((category) => (
					<div
						key={category.name}
						className={swatch(category)}
						style={{ width: `${(category.tokens / max) * 100}%` }}
					/>
				))}
			</div>
			<div className="space-y-1">
				{[...inWindow, ...outside].map((category) => (
					<div
						key={category.name}
						className={cn(
							"flex items-center gap-2 text-xs",
							deferred(category) && "text-muted-foreground",
						)}
					>
						<span
							className={cn("size-2.5 shrink-0 rounded-sm", swatch(category))}
						/>
						<span className="min-w-0 flex-1 truncate">{category.name}</span>
						<span className="tabular-nums text-muted-foreground">
							{formatCompactNumber(category.tokens)}
						</span>
						<span className="w-12 text-right tabular-nums">
							{deferred(category)
								? "—"
								: formatPercent(category.tokens / max, {
										maximumFractionDigits: 1,
									})}
						</span>
					</div>
				))}
			</div>
			<div className="space-y-1 border-t pt-2">
				<Details
					label={<Trans>MCP tools</Trans>}
					count={usage.mcpTools?.length ?? 0}
				>
					{usage.mcpTools?.map((tool) => (
						<Row
							key={`${tool.serverName}:${tool.name}`}
							name={tool.name}
							tokens={tool.tokens}
						/>
					))}
				</Details>
				<Details
					label={<Trans>Memory files</Trans>}
					count={usage.memoryFiles?.length ?? 0}
				>
					{usage.memoryFiles?.map((file) => (
						<Row
							key={file.path}
							name={file.path.split("/").slice(-2).join("/")}
							tokens={file.tokens}
						/>
					))}
				</Details>
			</div>
		</div>
	);
}
