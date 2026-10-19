import { Trans, useLingui } from "@lingui/react/macro";
import type { ForkConnection } from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	LuArrowUpRight,
	LuCode,
	LuColumns3,
	LuList,
	LuPlus,
	LuRefreshCw,
	LuSearch,
	LuTimer,
	LuX,
} from "react-icons/lu";
import { ForkSegmentedControl } from "renderer/components/ForkSegmentedControl";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { ForkProviderIcon } from "../../../ForkProviderIcon";
import type { ForkJiraTaskFilters, JiraStatus } from "../../fork-jira-query";

export function ForkJiraTaskToolbar({
	search,
	jira,
	projects,
	connectionId,
	text,
	setText,
	update,
	isFetching,
	onRefresh,
}: {
	search: ForkJiraTaskFilters;
	jira: ForkConnection[];
	projects: { id: string; key: string; name: string }[];
	connectionId: string;
	text: string;
	setText: (text: string) => void;
	update: (patch: Partial<ForkJiraTaskFilters>) => unknown;
	isFetching: boolean;
	onRefresh: () => void;
}) {
	const { t } = useLingui();
	const connection = jira.find((c) => c.id === connectionId);
	const scope = search.forkScope ?? "mine";
	const status = search.forkStatus ?? "open";
	const board = search.forkView === "board";
	const [advanced, setAdvanced] = useState(!!search.forkJql);
	const [draft, setDraft] = useState(search.forkJql ?? "");
	return (
		<>
			<PageHeader contentClassName="gap-3">
				<div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
					<ForkProviderIcon provider="jira" />
				</div>
				<h1 className="text-sm font-semibold">
					<Trans>Tasks</Trans>
				</h1>
				<span className="hidden truncate text-xs text-muted-foreground @md:inline">
					{connection?.site?.replace(/^https?:\/\//, "")}
				</span>
				<div className="flex-1" />
				<Button
					size="icon-sm"
					variant="ghost"
					disabled={isFetching}
					aria-label={t({ message: "Refresh" })}
					onClick={onRefresh}
				>
					<LuRefreshCw
						className={cn(
							"size-3.5",
							isFetching && "animate-spin motion-reduce:animate-none",
						)}
					/>
				</Button>
				{connection?.site && (
					<Button size="sm" variant="outline" asChild>
						<a
							href={`${connection.site}/secure/CreateIssue!default.jspa`}
							target="_blank"
							rel="noreferrer"
						>
							<LuPlus className="size-3.5" />
							<Trans>Create task</Trans>
							<LuArrowUpRight className="size-3 opacity-50" />
						</a>
					</Button>
				)}
			</PageHeader>
			<div className="space-y-3 border-b px-4 py-3">
				<div className="flex flex-wrap items-center gap-2">
					<ForkSegmentedControl
						value={scope}
						onChange={(value) => void update({ forkScope: value })}
						label={t({ message: "Assignee" })}
						disabled={!!search.forkJql}
						segments={[
							{ value: "mine", label: t({ message: "Assigned to me" }) },
							{ value: "all", label: t({ message: "All tasks" }) },
						]}
					/>
					<div className="flex-1" />
					{jira.length > 1 && (
						<Select
							value={connectionId}
							onValueChange={(id) =>
								void update({
									forkConnection: id,
									forkTask: undefined,
									forkJiraProject: undefined,
								})
							}
						>
							<SelectTrigger
								aria-label={t({ message: "Account" })}
								className="h-8 w-auto max-w-48 text-xs"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{jira.map((c) => (
									<SelectItem key={c.id} value={c.id}>
										{c.identity?.login ?? c.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
					<ForkSegmentedControl
						value={board ? "board" : "list"}
						onChange={(value) => void update({ forkView: value })}
						label={t({ message: "View" })}
						segments={[
							{ value: "list", label: t({ message: "List" }), icon: LuList },
							{
								value: "board",
								label: t({ message: "Board" }),
								icon: LuColumns3,
							},
						]}
					/>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<div className="relative min-w-40 flex-1">
						<LuSearch className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
						<Input
							aria-label={t({ message: "Search tasks" })}
							placeholder={t({ message: "Search tasks" })}
							className="h-8 bg-muted/40 pl-8 text-xs"
							value={text}
							disabled={!!search.forkJql}
							onChange={(e) => setText(e.target.value)}
						/>
					</div>
					<Select
						value={search.forkJiraProject ?? "all"}
						disabled={!!search.forkJql}
						onValueChange={(value) =>
							void update({
								forkJiraProject: value === "all" ? undefined : value,
							})
						}
					>
						<SelectTrigger
							aria-label={t({ message: "Project" })}
							className="h-8 w-auto max-w-48 text-xs"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">
								<Trans>All projects</Trans>
							</SelectItem>
							{projects.map((p) => (
								<SelectItem key={p.id} value={p.key}>
									{p.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Select
						value={status}
						disabled={!!search.forkJql}
						onValueChange={(value) =>
							void update({ forkStatus: value as JiraStatus })
						}
					>
						<SelectTrigger
							aria-label={t({ message: "Status" })}
							className="h-8 w-auto text-xs"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">
								<Trans>All statuses</Trans>
							</SelectItem>
							<SelectItem value="open">
								<Trans>Not done</Trans>
							</SelectItem>
							<SelectItem value="new">
								<Trans>To do</Trans>
							</SelectItem>
							<SelectItem value="indeterminate">
								<Trans>In progress</Trans>
							</SelectItem>
							<SelectItem value="done">
								<Trans>Done</Trans>
							</SelectItem>
						</SelectContent>
					</Select>
					<Button
						size="sm"
						variant={search.forkSprint ? "secondary" : "ghost"}
						disabled={!!search.forkJql}
						aria-pressed={!!search.forkSprint}
						className="h-8 text-xs"
						onClick={() =>
							void update({
								forkSprint: search.forkSprint ? undefined : "current",
							})
						}
					>
						<LuTimer className="size-3.5" />
						<Trans>Current sprint</Trans>
					</Button>
					<Button
						size="icon-sm"
						variant={advanced ? "secondary" : "ghost"}
						aria-label="JQL"
						title="JQL"
						onClick={() => setAdvanced(!advanced)}
					>
						<LuCode className="size-3.5" />
					</Button>
				</div>
				{advanced && (
					<form
						className="flex gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							void update({ forkJql: draft.trim() || undefined });
						}}
					>
						<Input
							aria-label="JQL"
							placeholder="JQL"
							className="h-8 font-mono text-xs"
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
						/>
						<Button size="sm" variant="outline">
							<Trans>Apply</Trans>
						</Button>
						{search.forkJql && (
							<Button
								type="button"
								size="icon-sm"
								variant="ghost"
								aria-label={t({ message: "Clear" })}
								onClick={() => {
									setDraft("");
									void update({ forkJql: undefined });
								}}
							>
								<LuX className="size-3.5" />
							</Button>
						)}
					</form>
				)}
			</div>
		</>
	);
}
