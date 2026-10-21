import { Trans, useLingui } from "@lingui/react/macro";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { ForkJiraBoardFilters } from "../../../ForkJiraTasks/components/ForkJiraBoardFilters";
import type {
	ForkJiraTaskFilters,
	JiraScope,
	JiraStatus,
} from "../../../ForkJiraTasks/fork-jira-query";
import type { useForkJiraBoardContext } from "../../../ForkJiraTasks/hooks/useForkJiraBoardContext";

export function ForkJiraAutomationFilters({
	filters,
	update,
	projects,
	context,
}: {
	filters: ForkJiraTaskFilters;
	update: (patch: Partial<ForkJiraTaskFilters>) => void;
	projects: { key: string; name: string }[];
	context: ReturnType<typeof useForkJiraBoardContext>;
}) {
	const { t } = useLingui();
	const selectClass = "h-9 w-full rounded-md border bg-background px-2 text-sm";
	return (
		<div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
			<div className="space-y-1.5">
				<Label htmlFor="jira-rule-jira-project">
					<Trans>Jira project</Trans>
				</Label>
				<select
					id="jira-rule-jira-project"
					className={selectClass}
					value={filters.forkJiraProject ?? ""}
					onChange={(e) =>
						update({
							forkJiraProject: e.target.value || undefined,
							forkJiraBoard: undefined,
							forkSprint: undefined,
						})
					}
				>
					<option value="">{t({ message: "All projects" })}</option>
					{projects.map((p) => (
						<option key={p.key} value={p.key}>
							{p.name}
						</option>
					))}
				</select>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="jira-rule-assignee">
					<Trans>Assignee</Trans>
				</Label>
				<select
					id="jira-rule-assignee"
					className={selectClass}
					value={filters.forkScope ?? "mine"}
					onChange={(e) => update({ forkScope: e.target.value as JiraScope })}
				>
					<option value="mine">{t({ message: "Assigned to me" })}</option>
					<option value="all">{t({ message: "All tasks" })}</option>
				</select>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="jira-rule-status">
					<Trans>Status</Trans>
				</Label>
				<select
					id="jira-rule-status"
					className={selectClass}
					value={filters.forkStatus ?? "open"}
					onChange={(e) => update({ forkStatus: e.target.value as JiraStatus })}
				>
					<option value="open">{t({ message: "Not done" })}</option>
					<option value="all">{t({ message: "All statuses" })}</option>
					<option value="new">{t({ message: "To do" })}</option>
					<option value="indeterminate">{t({ message: "In progress" })}</option>
					<option value="done">{t({ message: "Done" })}</option>
				</select>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="jira-rule-type">
					<Trans>Issue type</Trans>
				</Label>
				<Input
					id="jira-rule-type"
					value={filters.forkIssueType ?? ""}
					onChange={(e) =>
						update({ forkIssueType: e.target.value || undefined })
					}
				/>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="jira-rule-search">
					<Trans>Search tasks</Trans>
				</Label>
				<Input
					id="jira-rule-search"
					value={filters.search ?? ""}
					onChange={(e) => update({ search: e.target.value })}
				/>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="jira-rule-parent">
					<Trans>Parent issue</Trans>
				</Label>
				<Input
					id="jira-rule-parent"
					value={filters.forkParent ?? ""}
					onChange={(e) => update({ forkParent: e.target.value || undefined })}
				/>
			</div>
			<div className="col-span-2 flex flex-wrap items-center gap-2">
				<ForkJiraBoardFilters
					search={filters}
					context={context}
					update={update}
				/>
			</div>
		</div>
	);
}
