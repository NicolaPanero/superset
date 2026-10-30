import { Trans } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { cn } from "@superset/ui/utils";
import {
	ArrowRight,
	CircleDashed,
	Loader2,
	type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { jiraStatusTone } from "renderer/components/ForkIntegrations/components/ForkJiraTasks/fork-jira-query";

const AUTOMATIC = "__automatic__";
export function ForkJiraWorkflowStep({
	id,
	title,
	icon: Icon,
	value,
	onChange,
	statuses,
	disabled,
	loading,
	automaticHelp,
}: {
	id: string;
	title: ReactNode;
	icon: LucideIcon;
	value: string;
	onChange: (value: string) => void;
	statuses: { id: string; name: string; category: string }[];
	disabled: boolean;
	loading: boolean;
	automaticHelp: ReactNode;
}) {
	const selected = statuses.find((s) => s.id === value);
	return (
		<div className="grid min-w-0 items-start gap-4 rounded-xl border border-border/70 bg-background p-4 text-foreground @min-[640px]/jira-settings:grid-cols-[minmax(0,1fr)_minmax(220px,1fr)]">
			<div className="flex min-w-0 items-center gap-3 @min-[640px]/jira-settings:pt-5">
				<span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
					<Icon className="size-4" aria-hidden />
				</span>
				<h3
					id={`${id}-event`}
					className="min-w-0 flex-1 text-sm font-medium leading-relaxed [overflow-wrap:anywhere]"
				>
					{title}
				</h3>
				<ArrowRight
					className="hidden size-4 shrink-0 text-muted-foreground @min-[640px]/jira-settings:block"
					aria-hidden
				/>
			</div>
			<div className="min-w-0 space-y-2">
				<Label
					id={`${id}-label`}
					htmlFor={id}
					className="text-xs text-muted-foreground"
				>
					<Trans>Move task to</Trans>
				</Label>
				<Select
					value={value || AUTOMATIC}
					disabled={disabled}
					onValueChange={(v) => onChange(v === AUTOMATIC ? "" : v)}
				>
					<SelectTrigger
						id={id}
						aria-labelledby={`${id}-event ${id}-label`}
						aria-describedby={!value ? `${id}-help` : undefined}
						className="h-auto min-h-11 w-full min-w-0 whitespace-normal bg-background text-foreground data-[size=default]:h-auto dark:bg-background dark:hover:bg-accent/40 [&>[data-slot=select-value]]:min-w-0 [&>[data-slot=select-value]]:line-clamp-none"
					>
						<SelectValue>
							<span className="flex min-w-0 items-start gap-2">
								{loading ? (
									<Loader2
										className="mt-0.5 size-3.5 shrink-0 animate-spin"
										aria-hidden
									/>
								) : value ? (
									<span
										className={cn(
											"mt-1 size-2 shrink-0 rounded-full ring-2 ring-current/20",
											jiraStatusTone(selected?.category ?? "undefined"),
										)}
										style={{ backgroundColor: "currentColor" }}
										aria-hidden
									/>
								) : (
									<CircleDashed
										className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
										aria-hidden
									/>
								)}
								<span className="min-w-0 leading-relaxed [overflow-wrap:anywhere]">
									{loading ? (
										<Trans>Loading...</Trans>
									) : value ? (
										(selected?.name ?? value)
									) : (
										<Trans>Automatic</Trans>
									)}
								</span>
							</span>
						</SelectValue>
					</SelectTrigger>
					<SelectContent
						align="start"
						className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]"
					>
						<SelectItem value={AUTOMATIC}>
							<CircleDashed className="size-3.5" aria-hidden />
							<Trans>Automatic</Trans>
						</SelectItem>
						{value && !selected && (
							<SelectItem value={value}>{value}</SelectItem>
						)}
						{statuses.map((status) => (
							<SelectItem key={status.id} value={status.id} className="py-2.5">
								<span
									className={cn(
										"size-2 shrink-0 rounded-full",
										jiraStatusTone(status.category),
									)}
									style={{ backgroundColor: "currentColor" }}
									aria-hidden
								/>
								<span className="min-w-0 whitespace-normal leading-relaxed [overflow-wrap:anywhere]">
									{status.name}
								</span>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{!value && (
					<p
						id={`${id}-help`}
						className="text-xs leading-relaxed text-muted-foreground"
					>
						{automaticHelp}
					</p>
				)}
			</div>
		</div>
	);
}
