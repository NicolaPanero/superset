import { useLingui } from "@lingui/react/macro";
import type {
	ForkJiraColumn,
	ForkTask,
} from "@superset/shared/fork-integrations";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { cn } from "@superset/ui/utils";
import { HiOutlineUserCircle } from "react-icons/hi2";
import { PriorityIcon } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/PriorityIcon";
import { ForkTaskStatus } from "../../../ForkTaskStatus";
import { jiraPriorityLevel, jiraStatusType } from "../../fork-jira-query";

export function ForkJiraTaskRow({
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
	const { t } = useLingui();
	return (
		<div
			className={cn(
				"group relative flex h-10 items-center border-b border-border/50 hover:bg-accent/50",
				selected && "bg-accent",
			)}
		>
			<button
				type="button"
				aria-current={selected ? "true" : undefined}
				onClick={onClick}
				className="flex h-full min-w-0 flex-1 items-center gap-3 pl-4 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
			>
				<span title={task.priority ?? undefined} className="flex shrink-0">
					<PriorityIcon
						priority={jiraPriorityLevel(task.priority)}
						statusType={jiraStatusType(task.status.category)}
						className="size-4"
					/>
				</span>
				<span className="flex w-28 shrink-0 items-center gap-1.5">
					{task.type?.iconUrl && (
						<img
							alt={task.type.name}
							title={task.type.name}
							className="size-3.5 shrink-0"
							src={task.type.iconUrl}
						/>
					)}
					<span className="truncate font-mono text-xs text-muted-foreground tabular-nums">
						{task.key}
					</span>
				</span>
				<span className="min-w-0 flex-1 truncate text-sm font-medium">
					{task.title}
				</span>
				{task.parent && (
					<span
						className="hidden max-w-48 shrink-0 truncate text-xs text-muted-foreground @3xl/jira:inline"
						title={task.parent.title}
					>
						{task.parent.key} · {task.parent.title}
					</span>
				)}
				{task.labels.slice(0, 2).map((label) => (
					<span
						key={label}
						className="hidden max-w-28 shrink-0 truncate rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground @4xl/jira:inline"
					>
						{label}
					</span>
				))}
				{showSprint && task.sprint && (
					<span className="hidden max-w-36 shrink-0 truncate rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary @2xl/jira:inline">
						{task.sprint}
					</span>
				)}
			</button>
			<div className="flex shrink-0 items-center gap-3 pr-4 pl-3">
				<div className="max-w-40">
					<ForkTaskStatus task={task} columns={columns} />
				</div>
				<span
					title={task.assignee?.name ?? t({ message: "Unassigned" })}
					className="flex shrink-0"
				>
					{task.assignee ? (
						<Avatar
							size="xs"
							fullName={task.assignee.name}
							className="rounded-full"
						/>
					) : (
						<HiOutlineUserCircle className="size-5 text-muted-foreground" />
					)}
				</span>
			</div>
		</div>
	);
}
