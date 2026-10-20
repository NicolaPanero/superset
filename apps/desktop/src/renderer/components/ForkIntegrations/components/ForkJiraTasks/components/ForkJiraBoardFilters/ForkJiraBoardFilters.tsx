import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { LuLayoutDashboard, LuTimer } from "react-icons/lu";
import type { ForkJiraTaskFilters } from "../../fork-jira-query";
import type { useForkJiraBoardContext } from "../../hooks/useForkJiraBoardContext";

export function ForkJiraBoardFilters({
	search,
	context,
	update,
}: {
	search: ForkJiraTaskFilters;
	context: ReturnType<typeof useForkJiraBoardContext>;
	update: (patch: Partial<ForkJiraTaskFilters>) => unknown;
}) {
	const { t } = useLingui();
	if (!context.supported) return null;
	return (
		<>
			<Select
				value={search.forkJiraBoard ?? "all"}
				disabled={context.isPending}
				onValueChange={(value) =>
					void update({
						forkJiraBoard: value === "all" ? undefined : value,
						forkSprint: undefined,
					})
				}
			>
				<SelectTrigger
					aria-label={t({ message: "Jira board" })}
					size="sm"
					className="w-auto max-w-56 gap-1.5 border-border/60 px-2.5 text-xs shadow-none"
				>
					<LuLayoutDashboard className="size-3.5 shrink-0 text-muted-foreground" />
					<SelectValue placeholder={t({ message: "Jira board" })} />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">
						<Trans>All boards</Trans>
					</SelectItem>
					{context.data?.boards.map((board) => (
						<SelectItem key={board.id} value={String(board.id)}>
							{board.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select
				value={search.forkSprint ?? "all"}
				disabled={!!search.forkJql || context.isPending}
				onValueChange={(value) =>
					void update({ forkSprint: value === "all" ? undefined : value })
				}
			>
				<SelectTrigger
					aria-label={t({ message: "Sprint" })}
					size="sm"
					className="w-auto max-w-56 gap-1.5 border-border/60 px-2.5 text-xs shadow-none"
				>
					<LuTimer className="size-3.5 shrink-0 text-muted-foreground" />
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">
						<Trans>All sprints</Trans>
					</SelectItem>
					<SelectItem value="current">
						<Trans>Current sprint</Trans>
					</SelectItem>
					{context.data?.sprints.map((sprint) => (
						<SelectItem key={sprint.id} value={String(sprint.id)}>
							{sprint.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{context.isError ? (
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<Trans>Could not load Jira board settings.</Trans>
					<Button
						size="sm"
						variant="ghost"
						onClick={() => void context.refetch()}
					>
						<Trans>Try again</Trans>
					</Button>
					{search.forkJiraBoard && (
						<Button
							size="sm"
							variant="ghost"
							onClick={() =>
								void update({ forkJiraBoard: undefined, forkSprint: undefined })
							}
						>
							<Trans>Clear</Trans>
						</Button>
					)}
				</div>
			) : (
				search.forkView === "board" &&
				!search.forkJiraBoard && (
					<span className="text-[11px] text-muted-foreground">
						<Trans>Select a Jira board to use its columns.</Trans>
					</span>
				)
			)}
		</>
	);
}
