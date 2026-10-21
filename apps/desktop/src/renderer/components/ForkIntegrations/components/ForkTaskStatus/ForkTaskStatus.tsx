import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import type {
	ForkJiraColumn,
	ForkTask,
} from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { useId, useState } from "react";
import { LuChevronDown, LuLoaderCircle } from "react-icons/lu";
import { useForkTaskTransition } from "../../hooks/useForkTaskTransition";
import { jiraStatusTone } from "../ForkJiraTasks/fork-jira-query";
import { ForkTaskTransitionDialog } from "../ForkTaskTransitionDialog";
import { ForkTaskTransitionOptions } from "../ForkTaskTransitionOptions";

export function ForkTaskStatus({
	task,
	columns = [],
}: {
	task: ForkTask;
	columns?: ForkJiraColumn[];
}) {
	const { t } = useLingui();
	const key = task.key;
	const statusId = useId();
	const [open, setOpen] = useState(false);
	const change = useForkTaskTransition(task, open, () => setOpen(false));
	if (!change.supported)
		return (
			<span
				className={cn(
					"rounded px-1.5 py-0.5 text-[10px]",
					jiraStatusTone(task.status.category),
				)}
			>
				{task.status.name}
			</span>
		);
	return (
		<>
			<Popover
				open={open}
				onOpenChange={(next) => {
					if (!change.mutation.isPending) {
						setOpen(next);
						if (next) change.mutation.reset();
					}
				}}
			>
				<PopoverTrigger asChild>
					<button
						type="button"
						aria-label={t({
							message: `Change status of ${key}`,
						})}
						aria-describedby={statusId}
						title={task.status.name}
						className={cn(
							"inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							jiraStatusTone(task.status.category),
						)}
					>
						<span id={statusId} aria-live="polite" className="truncate">
							{task.status.name}
						</span>
						{change.mutation.isPending ? (
							<LuLoaderCircle className="size-3 animate-spin" />
						) : (
							<LuChevronDown className="size-3 shrink-0" />
						)}
					</button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-72 p-2">
					<div className="mb-2 border-b px-2 pb-2">
						<p className="font-mono text-[10px] text-muted-foreground">
							{task.key}
						</p>
						<p className="mt-1 text-xs font-medium">
							<Trans>Change status</Trans>
						</p>
					</div>
					<div className="max-h-80 overflow-y-auto">
						{change.transitions.isPending ? (
							<p className="p-2 text-xs text-muted-foreground">
								<Trans>Loading...</Trans>
							</p>
						) : change.transitions.isError ? (
							<div className="space-y-2 p-2">
								<p role="alert" className="text-xs text-destructive">
									{errorMessage(change.transitions.error)}
								</p>
								<Button
									size="sm"
									variant="outline"
									onClick={() => void change.transitions.refetch()}
								>
									<Trans>Try again</Trans>
								</Button>
							</div>
						) : change.transitions.data?.length ? (
							<ForkTaskTransitionOptions
								columns={columns}
								transitions={change.transitions.data}
								busy={change.mutation.isPending}
								onChoose={change.choose}
							/>
						) : (
							<p className="p-2 text-xs text-muted-foreground">
								<Trans>No available status changes</Trans>
							</p>
						)}
					</div>
					{change.mutation.error && !change.requiredTransition && (
						<p role="alert" className="p-2 text-xs text-destructive">
							{errorMessage(change.mutation.error)}
						</p>
					)}
				</PopoverContent>
			</Popover>
			<ForkTaskTransitionDialog
				key={change.requiredTransition?.id ?? "closed"}
				change={change}
			/>
		</>
	);
}
