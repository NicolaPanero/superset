import type { ForkTask } from "@superset/shared/fork-integrations";
import { cn } from "@superset/ui/utils";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Clock3 } from "lucide-react";
import { jiraStatusTone } from "renderer/components/ForkIntegrations/components/ForkJiraTasks/fork-jira-query";
export function ForkUnloggedTaskRow({ task }: { task: ForkTask }) {
	const done = task.status.category === "done";
	const Icon = done ? Check : Clock3;
	const tone = jiraStatusTone(task.status.category);
	return (
		<li>
			<Link
				to="/tasks"
				search={{
					forkSource: "jira",
					forkConnection: task.connectionId,
					forkTask: task.key,
				}}
				className="group flex min-w-0 items-start gap-3 px-4 py-4 outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring @min-[700px]/task-list:px-5"
			>
				<span
					className={cn(
						"mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
						tone,
					)}
				>
					<Icon className="size-3.5" aria-hidden />
				</span>
				<span className="grid min-w-0 flex-1 gap-x-4 gap-y-2 @min-[700px]/task-list:grid-cols-[minmax(0,1fr)_auto]">
					<span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 @min-[700px]/task-list:col-start-1 @min-[700px]/task-list:row-start-1">
						<span className="break-all font-mono text-xs text-muted-foreground">
							{task.key}
						</span>
						<span
							className={cn(
								"max-w-full break-words rounded-md px-2 py-0.5 text-[11px] font-medium @min-[700px]/task-list:hidden",
								tone,
							)}
						>
							{task.status.name}
						</span>
					</span>
					<span className="text-sm font-medium leading-relaxed [overflow-wrap:anywhere] @min-[700px]/task-list:col-start-1 @min-[700px]/task-list:row-start-2">
						{task.title}
					</span>
					<span
						className={cn(
							"hidden max-w-48 self-center break-words rounded-md px-2 py-1 text-xs @min-[700px]/task-list:col-start-2 @min-[700px]/task-list:row-span-2 @min-[700px]/task-list:row-start-1 @min-[700px]/task-list:block",
							tone,
						)}
					>
						{task.status.name}
					</span>
				</span>
				<ArrowRight
					className="mt-1.5 size-3.5 shrink-0 text-muted-foreground/40 group-hover:text-foreground group-focus-visible:text-foreground"
					aria-hidden
				/>
			</Link>
		</li>
	);
}
