import type {
	ForkJiraColumn,
	ForkTask,
} from "@superset/shared/fork-integrations";
import { cn } from "@superset/ui/utils";
import { LuArrowUp, LuCheck, LuCircle, LuCircleDot } from "react-icons/lu";
import { ForkTaskStatus } from "../../../ForkTaskStatus";
import { jiraStatusTone } from "../../fork-jira-query";

export function ForkJiraTaskCard({
	task,
	selected,
	board,
	columns,
	onClick,
}: {
	task: ForkTask;
	selected: boolean;
	board?: boolean;
	columns?: ForkJiraColumn[];
	onClick: () => void;
}) {
	const Icon =
		task.status.category === "done"
			? LuCheck
			: task.status.category === "indeterminate"
				? LuCircleDot
				: LuCircle;
	return (
		<div className="relative">
			<button
				type="button"
				aria-current={selected ? "true" : undefined}
				onClick={onClick}
				className={cn(
					"group w-full min-w-0 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
					board
						? "space-y-3 rounded-xl border bg-background p-3.5 shadow-sm hover:border-primary/30"
						: "flex items-center gap-3 rounded-lg py-2.5 pl-3 pr-36 hover:bg-accent/50",
					selected && "bg-accent ring-1 ring-inset ring-border",
				)}
			>
				{!board && (
					<Icon
						className={cn(
							"size-4 shrink-0 rounded-full",
							jiraStatusTone(task.status.category),
						)}
					/>
				)}
				<div className="min-w-0 flex-1 space-y-1.5">
					<div
						className={cn(
							"flex min-w-0 items-center gap-2",
							board && "min-h-6 pr-28",
						)}
					>
						{task.type?.iconUrl && (
							<img
								alt={task.type.name}
								title={task.type.name}
								className="size-3.5 shrink-0"
								src={task.type.iconUrl}
							/>
						)}
						<span className="font-mono text-[11px] text-muted-foreground">
							{task.key}
						</span>
						{task.parent && (
							<span
								className="min-w-0 truncate text-[10px] text-muted-foreground"
								title={task.parent.title}
							>
								{task.parent.key}
							</span>
						)}
					</div>
					<p
						className={cn(
							"text-[13px] font-medium leading-relaxed",
							board ? "line-clamp-3" : "truncate",
						)}
					>
						{task.title}
					</p>
				</div>
				<div
					className={cn(
						"flex shrink-0 items-center gap-2 text-muted-foreground",
						board && "border-t border-border/50 pt-2.5",
					)}
				>
					{board && (
						<div className="flex min-w-0 flex-1 gap-1 overflow-hidden">
							{task.sprint && (
								<span className="truncate rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
									{task.sprint}
								</span>
							)}
							{task.labels.slice(0, 2).map((label) => (
								<span
									key={label}
									className="truncate rounded bg-muted px-1.5 py-0.5 text-[10px]"
								>
									{label}
								</span>
							))}
						</div>
					)}
					{task.priority && (
						<span
							title={task.priority}
							className="inline-flex items-center gap-1 text-[10px]"
						>
							<LuArrowUp className="size-3" />
							{board && task.priority}
						</span>
					)}
					{task.assignee && (
						<span
							title={task.assignee.name}
							className="flex size-6 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-foreground ring-1 ring-border"
						>
							{task.assignee.name
								.split(/\s+/)
								.map((part) => part[0])
								.slice(0, 2)
								.join("")
								.toUpperCase()}
						</span>
					)}
				</div>
			</button>
			<div
				className={cn("absolute right-3 max-w-32", board ? "top-3.5" : "top-2")}
			>
				<ForkTaskStatus task={task} columns={columns} />
			</div>
		</div>
	);
}
