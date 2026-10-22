import { normalizePlanEntryStatus, type Plan } from "@superset/chat/protocol";
import { cn } from "@superset/ui/utils";
import { CheckCircle2, Circle, CircleDotDashed } from "lucide-react";

const ICON_BY_STATUS = {
	pending: Circle,
	in_progress: CircleDotDashed,
	completed: CheckCircle2,
} as const;

export function ForkPlanSteps({
	entries,
	itemId,
}: {
	entries: Plan["entries"];
	itemId?: string;
}) {
	return (
		<ol className="flex flex-col gap-3">
			{entries.map((entry, index) => {
				const status = normalizePlanEntryStatus(entry.status);
				const Icon = ICON_BY_STATUS[status];
				return (
					<li
						key={`${index}:${entry.text}`}
						className="flex items-start gap-2.5 text-sm leading-5"
					>
						<Icon
							className={cn(
								"mt-0.5 size-4 shrink-0",
								status === "completed"
									? "text-emerald-500"
									: status === "in_progress"
										? "text-primary"
										: "text-muted-foreground/60",
							)}
						/>
						<span
							data-find-item={itemId}
							className={cn(
								"min-w-0 break-words",
								status === "completed" && "text-muted-foreground line-through",
							)}
						>
							{entry.text}
						</span>
					</li>
				);
			})}
		</ol>
	);
}
