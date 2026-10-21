import { useFormat } from "@superset/i18n/react";
import type {
	ForkJiraColumn,
	ForkTask,
} from "@superset/shared/fork-integrations";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuChevronRight } from "react-icons/lu";
import { StatusIcon } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import { forkJiraColumnForStatus } from "../../../../utils/forkJiraColumns";
import { jiraStatusColor, jiraStatusType } from "../../fork-jira-query";
import { ForkJiraTaskRow } from "../ForkJiraTaskRow";

export function ForkJiraTaskList({
	tasks,
	columns,
	selected,
	showSprint,
	onSelect,
}: {
	tasks: ForkTask[];
	columns: ForkJiraColumn[];
	selected?: string;
	showSprint?: boolean;
	onSelect: (key: string) => void;
}) {
	const { formatNumber } = useFormat();
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
	const groups = columns
		.map((column) => ({
			column,
			tasks: tasks.filter(
				(task) =>
					forkJiraColumnForStatus(columns, task.status)?.id === column.id,
			),
		}))
		.filter((group) => group.tasks.length > 0);
	const toggle = (id: string) =>
		setCollapsed((current) => {
			const next = new Set(current);
			if (!next.delete(id)) next.add(id);
			return next;
		});
	return (
		<div>
			{groups.map(({ column, tasks: entries }) => {
				const category =
					column.category ?? entries[0]?.status.category ?? "new";
				const open = !collapsed.has(column.id);
				return (
					<section key={column.id} aria-label={column.name}>
						<button
							type="button"
							aria-expanded={open}
							onClick={() => toggle(column.id)}
							className="sticky top-0 z-10 flex h-9 w-full items-center gap-2 border-b border-border/50 bg-[color-mix(in_srgb,var(--muted)_35%,var(--background))] px-4 text-left hover:bg-muted"
						>
							<LuChevronRight
								className={cn(
									"size-3.5 text-muted-foreground transition-transform",
									open && "rotate-90",
								)}
							/>
							<StatusIcon
								type={jiraStatusType(category)}
								color={jiraStatusColor(category)}
							/>
							<span className="text-xs font-semibold">{column.name}</span>
							<span className="text-xs tabular-nums text-muted-foreground">
								{formatNumber(entries.length)}
							</span>
						</button>
						{open &&
							entries.map((task) => (
								<ForkJiraTaskRow
									key={task.id}
									task={task}
									columns={columns}
									showSprint={showSprint}
									selected={selected === task.key}
									onClick={() => onSelect(task.key)}
								/>
							))}
					</section>
				);
			})}
		</div>
	);
}
