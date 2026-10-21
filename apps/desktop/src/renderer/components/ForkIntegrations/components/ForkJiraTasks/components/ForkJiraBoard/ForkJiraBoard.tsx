import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { useFormat } from "@superset/i18n/react";
import type {
	ForkJiraColumn,
	ForkTask,
} from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { cn } from "@superset/ui/utils";
import { useRef, useState } from "react";
import { StatusIcon } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import { useForkTaskTransition } from "../../../../hooks/useForkTaskTransition";
import { forkJiraColumnForStatus } from "../../../../utils/forkJiraColumns";
import { ForkTaskTransitionDialog } from "../../../ForkTaskTransitionDialog";
import { ForkTaskTransitionOptions } from "../../../ForkTaskTransitionOptions";
import { jiraStatusColor, jiraStatusType } from "../../fork-jira-query";
import { ForkJiraTaskCard } from "../ForkJiraTaskCard";

const DRAG_TYPE = "application/x-superset-jira-issue";

export function ForkJiraBoard({
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
	const { t } = useLingui();
	const { formatNumber } = useFormat();
	const [moving, setMoving] = useState<ForkTask | null>(null);
	const [over, setOver] = useState<string | null>(null);
	const [destination, setDestination] = useState<ForkJiraColumn | null>(null);
	const column = destination?.name ?? "";
	const [dropping, setDropping] = useState(false);
	const [dragError, setDragError] = useState<unknown>(null);
	const dropAccepted = useRef(false);
	const change = useForkTaskTransition(moving, !!moving, () => {
		setMoving(null);
		setDestination(null);
	});
	const busy = change.mutation.isPending || dropping;
	const options = (column: ForkJiraColumn) =>
		change.transitions.data?.filter(
			(entry) =>
				entry.to &&
				entry.to.id !== moving?.status.id &&
				forkJiraColumnForStatus(columns, entry.to)?.id === column.id,
		) ?? [];
	const drop = async (column: ForkJiraColumn) => {
		dropAccepted.current = true;
		setOver(null);
		setDropping(true);
		try {
			const result = await change.transitions.refetch();
			if (!result.data || result.error) {
				setDragError(result.error);
				setMoving(null);
				return;
			}
			const candidates = result.data.filter(
				(entry) =>
					entry.to &&
					entry.to.id !== moving?.status.id &&
					forkJiraColumnForStatus(columns, entry.to)?.id === column.id,
			);
			const [first] = candidates;
			if (candidates.length === 1 && first) change.choose(first);
			else setDestination(column);
		} finally {
			setDropping(false);
		}
	};
	return (
		<div className="flex min-h-full flex-col gap-3 p-4">
			{(dragError ||
				change.transitions.error ||
				(change.mutation.error && !change.requiredTransition)) && (
				<p
					role="alert"
					className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
				>
					{errorMessage(
						dragError ?? change.transitions.error ?? change.mutation.error,
					)}
				</p>
			)}
			<div aria-live="polite" className="sr-only">
				{busy && <Trans>Saving...</Trans>}
			</div>
			<div className="flex flex-1 items-stretch gap-3">
				{columns.map((column) => {
					const entries = tasks.filter(
						(task) =>
							forkJiraColumnForStatus(columns, task.status)?.id === column.id,
					);
					const category =
						column.category ?? entries[0]?.status.category ?? "new";
					const available =
						!!moving &&
						!busy &&
						(change.transitions.isFetching || options(column).length > 0);
					return (
						<section
							key={column.id}
							aria-label={column.name}
							className={cn(
								"flex min-h-60 flex-col rounded-xl bg-[color-mix(in_srgb,var(--muted)_35%,var(--background))] transition-colors",
								entries.length
									? "w-72 min-w-72 max-w-md flex-1"
									: "w-52 shrink-0",
								over === column.id &&
									available &&
									"bg-primary/5 ring-1 ring-primary",
							)}
							onDragOver={(event) => {
								if (available) {
									event.preventDefault();
									event.dataTransfer.dropEffect = "move";
									setOver(column.id);
								}
							}}
							onDragLeave={(event) => {
								if (
									!event.currentTarget.contains(
										event.relatedTarget as Node | null,
									)
								)
									setOver(null);
							}}
							onDrop={(event) => {
								event.preventDefault();
								if (
									available &&
									event.dataTransfer.getData(DRAG_TYPE) === moving?.id
								)
									void drop(column);
							}}
						>
							<div className="sticky top-0 z-10 flex items-center gap-2 rounded-t-xl bg-[color-mix(in_srgb,var(--muted)_35%,var(--background))] px-3 pt-3 pb-2">
								<StatusIcon
									type={jiraStatusType(category)}
									color={jiraStatusColor(category)}
								/>
								<h2
									className="min-w-0 truncate text-xs font-semibold"
									title={column.name}
								>
									{column.name}
								</h2>
								<span className="text-xs tabular-nums text-muted-foreground">
									{formatNumber(entries.length)}
								</span>
							</div>
							<div className="flex-1 space-y-2 px-2 pb-2">
								{entries.map((task) => (
									<fieldset
										aria-label={task.key}
										key={task.id}
										draggable={change.supported && !busy}
										className={cn(
											change.supported &&
												!busy &&
												"cursor-grab active:cursor-grabbing",
											moving?.id === task.id && "opacity-60",
										)}
										onDragStart={(event) => {
											event.dataTransfer.setData(DRAG_TYPE, task.id);
											event.dataTransfer.effectAllowed = "move";
											dropAccepted.current = false;
											change.mutation.reset();
											setDragError(null);
											setMoving(task);
										}}
										onDragEnd={() => {
											setOver(null);
											if (!dropAccepted.current) setMoving(null);
										}}
									>
										<ForkJiraTaskCard
											task={task}
											columns={columns}
											selected={selected === task.key}
											showSprint={showSprint}
											onClick={() => onSelect(task.key)}
										/>
									</fieldset>
								))}
								{!entries.length && (
									<div className="grid min-h-16 place-items-center rounded-lg border border-dashed border-border/60 text-[11px] text-muted-foreground">
										<Trans>No tasks</Trans>
									</div>
								)}
							</div>
						</section>
					);
				})}
			</div>
			<Dialog
				open={!!destination}
				onOpenChange={(open) => {
					if (!open && !change.mutation.isPending) {
						setDestination(null);
						setMoving(null);
					}
				}}
			>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>
							{t({
								message: `Choose a status in ${column}`,
							})}
						</DialogTitle>
						<DialogDescription>
							{moving?.key} · {moving?.status.name}
						</DialogDescription>
					</DialogHeader>
					{destination && options(destination).length ? (
						<ForkTaskTransitionOptions
							columns={columns}
							transitions={options(destination)}
							busy={change.mutation.isPending}
							onChoose={(transition) => {
								setDestination(null);
								change.choose(transition);
							}}
						/>
					) : (
						<p className="text-sm text-muted-foreground">
							<Trans>No available status changes</Trans>
						</p>
					)}
					<Button
						variant="outline"
						onClick={() => {
							setDestination(null);
							setMoving(null);
						}}
					>
						<Trans>Cancel</Trans>
					</Button>
				</DialogContent>
			</Dialog>
			<ForkTaskTransitionDialog
				key={change.requiredTransition?.id ?? "closed"}
				change={change}
				onCancel={() => setMoving(null)}
			/>
		</div>
	);
}
