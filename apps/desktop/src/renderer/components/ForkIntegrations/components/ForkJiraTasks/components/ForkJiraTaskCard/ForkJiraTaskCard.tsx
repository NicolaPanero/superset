import type {
	ForkJiraColumn,
	ForkTask,
} from "@superset/shared/fork-integrations";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { cn } from "@superset/ui/utils";
import { PriorityIcon } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/PriorityIcon";
import { ForkTaskStatus } from "../../../ForkTaskStatus";
import { jiraPriorityLevel, jiraStatusType } from "../../fork-jira-query";

export function ForkJiraTaskCard({
	task,
	selected,
	columns,
	showSprint,
	onClick,
}: {
	task: ForkTask;
	selected: boolean;
	columns?: ForkJiraColumn[];
	showSprint?: boolean;
	onClick: () => void;
}) {
	return (
		<div
			className={cn(
				"group relative rounded-lg border border-border/60 bg-card shadow-xs transition-colors hover:border-border hover:bg-accent/30",
				selected && "border-primary/60 bg-accent/40 ring-1 ring-primary/40",
			)}
		>
			<button
				type="button"
				aria-current={selected ? "true" : undefined}
				onClick={onClick}
				className="block w-full min-w-0 space-y-2 px-3 pt-2.5 pb-9 text-left focus-visible:rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<div className="flex min-w-0 items-center gap-1.5 pr-6">
					{task.type?.iconUrl && (
						<img
							alt={task.type.name}
							title={task.type.name}
							className="size-3.5 shrink-0"
							src={task.type.iconUrl}
						/>
					)}
					<span className="shrink-0 font-mono text-[11px] text-muted-foreground">
						{task.key}
					</span>
					{task.parent && (
						<span
							className="min-w-0 truncate text-[11px] text-muted-foreground/70"
							title={task.parent.title}
						>
							· {task.parent.key}
						</span>
					)}
				</div>
				<p className="line-clamp-3 text-[13px] font-medium leading-snug">
					{task.title}
				</p>
				{(task.labels.length > 0 || (showSprint && task.sprint)) && (
					<div className="flex min-w-0 flex-wrap gap-1">
						{showSprint && task.sprint && (
							<span className="max-w-full truncate rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
								{task.sprint}
							</span>
						)}
						{task.labels.slice(0, 3).map((label) => (
							<span
								key={label}
								className="max-w-32 truncate rounded-full border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground"
							>
								{label}
							</span>
						))}
					</div>
				)}
			</button>
			{task.assignee && (
				<Avatar
					size="xs"
					fullName={task.assignee.name}
					className="pointer-events-none absolute top-2 right-2.5 rounded-full"
				/>
			)}
			<div className="absolute right-2.5 bottom-2 left-3 flex items-center gap-2">
				<span
					title={task.priority ?? undefined}
					className="flex items-center gap-1 text-[11px] text-muted-foreground"
				>
					<PriorityIcon
						priority={jiraPriorityLevel(task.priority)}
						statusType={jiraStatusType(task.status.category)}
						className="size-3.5"
					/>
				</span>
				<div className="ml-auto min-w-0 max-w-[70%]">
					<ForkTaskStatus task={task} columns={columns} />
				</div>
			</div>
		</div>
	);
}
