import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import type { ForkConnection } from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { cn } from "@superset/ui/utils";
import { type ReactNode, useState } from "react";
import {
	LuArrowUpRight,
	LuCode,
	LuColumns3,
	LuFolder,
	LuList,
	LuListFilter,
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
import type { useForkJiraBoardContext } from "../../hooks/useForkJiraBoardContext";
import { ForkJiraBoardFilters } from "../ForkJiraBoardFilters";

const FILTER_TRIGGER =
	"w-auto max-w-56 gap-1.5 border-border/60 px-2.5 text-xs shadow-none";

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
	boardContext,
	count,
	automations,
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
	boardContext: ReturnType<typeof useForkJiraBoardContext>;
	count: ReactNode;
	automations: ReactNode;
}) {
	const { t } = useLingui();
	const { formatNumber } = useFormat();
	const extraFilterCount = [search.forkIssueType, search.forkParent].filter(
		Boolean,
	).length;
	const connection = jira.find((c) => c.id === connectionId);
	const scope = search.forkScope ?? "mine";
	const status = search.forkStatus ?? "open";
	const board = search.forkView === "board";
	const jqlActive = !!search.forkJql;
	const [advanced, setAdvanced] = useState(jqlActive);
	const [draft, setDraft] = useState(search.forkJql ?? "");
	const viewButton = (value: "list" | "board", label: string) => {
		const Icon = value === "list" ? LuList : LuColumns3;
		const active = (value === "board") === board;
		return (
			<button
				type="button"
				title={label}
				aria-label={label}
				aria-pressed={active}
				className={cn(
					"flex size-6 items-center justify-center rounded-sm transition-colors",
					active
						? "bg-background text-foreground shadow-sm"
						: "text-muted-foreground hover:text-foreground",
				)}
				onClick={() => void update({ forkView: value })}
			>
				<Icon className="size-3.5" />
			</button>
		);
	};
	return (
		<>
			<PageHeader contentClassName="gap-2.5">
				<div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
					<ForkProviderIcon provider="jira" />
				</div>
				<h1 className="text-sm font-semibold">
					<Trans>Tasks</Trans>
				</h1>
				<span
					aria-live="polite"
					className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground"
				>
					{count}
				</span>
				<span className="hidden truncate text-xs text-muted-foreground @md:inline">
					{connection?.site?.replace(/^https?:\/\//, "")}
				</span>
				<div className="flex-1" />
				<div className="relative w-40 @3xl:w-56">
					<LuSearch className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
					<Input
						aria-label={t({ message: "Search tasks" })}
						placeholder={t({ message: "Search tasks" })}
						className="h-8 border-border/60 bg-transparent pl-8 text-xs shadow-none"
						value={text}
						disabled={jqlActive}
						onChange={(e) => setText(e.target.value)}
					/>
				</div>
				<Button
					size="icon-sm"
					variant={advanced || jqlActive ? "secondary" : "ghost"}
					aria-label="JQL"
					aria-pressed={advanced}
					title="JQL"
					onClick={() => setAdvanced(!advanced)}
				>
					<LuCode className="size-3.5" />
				</Button>
				<fieldset
					className="flex items-center rounded-md border bg-muted/30 p-0.5"
					aria-label={t({ message: "View" })}
				>
					{viewButton("list", t({ message: "List" }))}
					{viewButton("board", t({ message: "Board" }))}
				</fieldset>
				<div className="h-4 w-px shrink-0 bg-border" />
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
							size="sm"
							aria-label={t({ message: "Account" })}
							className={FILTER_TRIGGER}
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
				<Button
					size="icon-sm"
					variant="ghost"
					disabled={isFetching}
					aria-label={t({ message: "Refresh" })}
					title={t({ message: "Refresh" })}
					onClick={onRefresh}
				>
					<LuRefreshCw
						className={cn(
							"size-3.5",
							isFetching && "animate-spin motion-reduce:animate-none",
						)}
					/>
				</Button>
				{automations}
				{connection?.site && (
					<Button size="sm" variant="outline" className="h-8" asChild>
						<a
							href={`${connection.site}/secure/CreateIssue!default.jspa`}
							target="_blank"
							rel="noreferrer"
						>
							<LuPlus className="size-3.5" />
							<span className="hidden @2xl:inline">
								<Trans>Create task</Trans>
							</span>
							<LuArrowUpRight className="size-3 opacity-50" />
						</a>
					</Button>
				)}
			</PageHeader>
			<div className="space-y-2 border-b px-4 py-2">
				<div className="flex flex-wrap items-center gap-2">
					<ForkSegmentedControl
						value={scope}
						onChange={(value) => void update({ forkScope: value })}
						label={t({ message: "Assignee" })}
						disabled={jqlActive}
						segments={[
							{ value: "mine", label: t({ message: "Assigned to me" }) },
							{ value: "all", label: t({ message: "All tasks" }) },
						]}
					/>
					<div className="h-4 w-px shrink-0 bg-border" />
					<ForkJiraBoardFilters
						search={search}
						context={boardContext}
						update={update}
					/>
					<Select
						value={search.forkJiraProject ?? "all"}
						disabled={jqlActive}
						onValueChange={(value) =>
							void update({
								forkJiraProject: value === "all" ? undefined : value,
							})
						}
					>
						<SelectTrigger
							size="sm"
							aria-label={t({ message: "Project" })}
							className={FILTER_TRIGGER}
						>
							<LuFolder className="size-3.5 shrink-0 text-muted-foreground" />
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
						disabled={jqlActive}
						onValueChange={(value) =>
							void update({ forkStatus: value as JiraStatus })
						}
					>
						<SelectTrigger
							size="sm"
							aria-label={t({ message: "Status" })}
							className={FILTER_TRIGGER}
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
					{!boardContext.supported && (
						<Button
							size="sm"
							variant={search.forkSprint ? "secondary" : "ghost"}
							disabled={jqlActive}
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
					)}
					<Popover>
						<PopoverTrigger asChild>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								disabled={jqlActive}
								className={cn(
									"h-8 gap-1.5 px-2 text-xs text-muted-foreground",
									extraFilterCount > 0 && "bg-accent text-foreground",
								)}
							>
								<LuListFilter className="size-3.5" />
								<Trans>More filters</Trans>
								{extraFilterCount > 0 && (
									<span className="rounded bg-background px-1 text-[10px] tabular-nums">
										{formatNumber(extraFilterCount)}
									</span>
								)}
							</Button>
						</PopoverTrigger>
						<PopoverContent align="start" className="w-64 space-y-3 p-3">
							<div className="space-y-1.5">
								<Label htmlFor="jira-issue-type" className="text-xs">
									<Trans>Issue type</Trans>
								</Label>
								<Input
									id="jira-issue-type"
									placeholder="Bug, Story…"
									className="h-8 text-xs"
									value={search.forkIssueType ?? ""}
									onChange={(event) =>
										void update({
											forkIssueType: event.target.value || undefined,
										})
									}
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="jira-parent" className="text-xs">
									<Trans>Parent issue</Trans>
								</Label>
								<Input
									id="jira-parent"
									placeholder="PROJ-123"
									className="h-8 font-mono text-xs"
									value={search.forkParent ?? ""}
									onChange={(event) =>
										void update({
											forkParent: event.target.value || undefined,
										})
									}
								/>
							</div>
						</PopoverContent>
					</Popover>
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
							placeholder="project = PROJ AND status = 'In Progress'"
							className="h-8 font-mono text-xs"
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
						/>
						<Button size="sm" variant="outline" className="h-8">
							<Trans>Apply</Trans>
						</Button>
						{jqlActive && (
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
