import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Textarea } from "@superset/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuZap } from "react-icons/lu";
import { useForkConnections } from "../../hooks/useForkConnections";
import { required } from "../../utils/required";
import {
	type ForkJiraTaskFilters,
	forkJiraQuery,
} from "../ForkJiraTasks/fork-jira-query";
import { useForkJiraBoardContext } from "../ForkJiraTasks/hooks/useForkJiraBoardContext";
import { ForkAutomationLimits } from "./components/ForkAutomationLimits";
import {
	FORK_AUTOMATION_DEFAULT_OPTIONS,
	ForkAutomationOptions,
	type ForkAutomationOptionsValue,
} from "./components/ForkAutomationOptions";
import { ForkAutomationRuleCard } from "./components/ForkAutomationRuleCard";
import {
	type ForkJiraAgentChoice,
	ForkJiraAutomationAgent,
} from "./components/ForkJiraAutomationAgent";
import { ForkJiraAutomationFilters } from "./components/ForkJiraAutomationFilters";
import {
	FORK_AUTOMATION_SOURCES,
	FORK_AUTOMATION_TEMPLATES,
} from "./utils/forkAutomationTemplates";

export function ForkJiraAutomations({
	connectionId,
	jql,
	initialFilters,
}: {
	connectionId: string;
	jql: string;
	initialFilters: ForkJiraTaskFilters;
}) {
	const { t, i18n } = useLingui();
	const { client, hostUrl, data } = useForkConnections();
	const cache = useQueryClient();
	const [open, setOpen] = useState(false);
	const v2 = (data?.version ?? 0) >= 9;
	const [editingId, setEditingId] = useState<string | null>(null);
	const [options, setOptions] = useState<ForkAutomationOptionsValue>(
		FORK_AUTOMATION_DEFAULT_OPTIONS,
	);
	const isJira = options.sourceKind === "jira";
	const sourceInfo = FORK_AUTOMATION_SOURCES.find(
		(source) => source.kind === options.sourceKind,
	);
	const [name, setName] = useState("");
	const [query, setQuery] = useState("");
	const [projectId, setProjectId] = useState("");
	const [choice, setChoice] = useState<ForkJiraAgentChoice>({
		agent: "",
		surface: "chat",
	});
	const [filters, setFilters] = useState<ForkJiraTaskFilters>({
		...initialFilters,
		forkJql: undefined,
	});
	const [advanced, setAdvanced] = useState(!!initialFilters.forkJql);
	const launchSupported = (data?.version ?? 0) >= 6;
	const boardContext = useForkJiraBoardContext(
		open ? connectionId : "",
		filters.forkJiraBoard,
		filters.forkJiraProject,
	);
	const jiraProjects = useQuery({
		queryKey: ["fork-integrations", hostUrl, "jira-projects", connectionId],
		queryFn: () => required(client).forkTasks.projects.query({ connectionId }),
		enabled: open && !!client,
		retry: false,
	});
	const filtersUnavailable =
		jiraProjects.isFetching ||
		jiraProjects.isError ||
		boardContext.isFetching ||
		(!!filters.forkJiraBoard && !boardContext.data?.board?.filterId);
	const generatedQuery = forkJiraQuery({
		search: filters.search ?? "",
		scope: filters.forkScope ?? "mine",
		status: filters.forkStatus ?? "open",
		project: filters.forkJiraProject ?? "",
		jql: "",
		projectKeys: jiraProjects.data?.map((p) => p.key),
		sprint: filters.forkSprint,
		issueType: filters.forkIssueType,
		parent: filters.forkParent,
		boardFilter: boardContext.data?.board?.filterId ?? undefined,
	});
	const [prompt, setPrompt] = useState("");
	const rules = useQuery({
		queryKey: ["fork-integrations", hostUrl, "automations", connectionId],
		queryFn: () =>
			required(client).forkTasks.automationList.query({ connectionId }),
		enabled: open && !!client,
		retry: false,
		networkMode: "always",
		refetchInterval: open ? 15000 : false,
	});
	const projects = useQuery({
		queryKey: ["fork-integrations", hostUrl, "automation-projects"],
		queryFn: () => required(client).project.list.query(),
		enabled: open && !!client,
		retry: false,
	});
	const mutation = useMutation({
		networkMode: "always",
		retry: false,
		mutationFn: async () => {
			const launch = launchSupported
				? {
						launch: {
							surface: choice.surface,
							model: choice.model,
							accountSelection: choice.accountSelection,
						},
					}
				: {};
			const jqlValue = isJira ? (advanced ? query : generatedQuery) : "";
			const ruleOptions = {
				sourceKind: options.sourceKind,
				...(options.sourceKind === "schedule"
					? {
							schedule: {
								days: options.days,
								time: options.time,
								timeZone: options.timeZone,
							},
						}
					: {}),
				refire: options.refire,
				catchupMinutes: options.catchupMinutes,
				verifyCommand: options.verifyCommand.trim() || null,
				retryLimit: options.retryLimit,
				targetLimit: options.targetLimit,
			};
			if (editingId)
				return required(client).forkTasks.automationUpdate.mutate({
					id: editingId,
					projectId,
					name,
					jql: jqlValue,
					agent: choice.agent,
					prompt,
					...launch,
					options: ruleOptions,
				});
			return required(client).forkTasks.automationCreate.mutate({
				connectionId,
				projectId,
				name,
				jql: jqlValue,
				agent: choice.agent,
				...launch,
				prompt,
				...(v2 ? { options: ruleOptions } : {}),
			});
		},
		onSuccess: () => {
			resetForm();
			void cache.invalidateQueries({
				queryKey: ["fork-integrations", hostUrl, "automations"],
			});
		},
	});
	const resetForm = () => {
		setEditingId(null);
		setName("");
		setPrompt("");
		setOptions(FORK_AUTOMATION_DEFAULT_OPTIONS);
	};
	const applyTemplate = (templateId: string) => {
		const template = FORK_AUTOMATION_TEMPLATES.find(
			(tp) => tp.id === templateId,
		);
		if (!template) return;
		setName(i18n._(template.name));
		setPrompt(template.prompt);
		setOptions((current) => ({
			...current,
			sourceKind: template.sourceKind,
			retryLimit: template.retryLimit,
			targetLimit: template.targetLimit,
		}));
	};
	type ListedRule = NonNullable<typeof rules.data>[number];
	const startEdit = (rule: ListedRule) => {
		setEditingId(rule.id);
		setName(rule.name);
		setPrompt(rule.prompt);
		setProjectId(rule.projectId);
		setQuery(rule.jql);
		setAdvanced(true);
		setChoice({
			agent: rule.agent,
			surface: rule.launch?.surface === "terminal" ? "terminal" : "chat",
			model: rule.launch?.model ?? undefined,
			accountSelection: rule.launch?.accountSelection ?? undefined,
		});
		const config = (rule.options?.sourceConfig ?? {}) as {
			days?: number[];
			time?: string;
			timeZone?: string;
		};
		setOptions({
			sourceKind: rule.options?.sourceKind ?? "jira",
			refire: rule.options?.refire ?? "never",
			verifyCommand: rule.options?.verifyCommand ?? "",
			retryLimit: rule.options?.retryLimit ?? 3,
			targetLimit: rule.options?.targetLimit ?? null,
			catchupMinutes: rule.options?.catchupMinutes ?? 120,
			days: config.days ?? FORK_AUTOMATION_DEFAULT_OPTIONS.days,
			time: config.time ?? FORK_AUTOMATION_DEFAULT_OPTIONS.time,
			timeZone: config.timeZone ?? FORK_AUTOMATION_DEFAULT_OPTIONS.timeZone,
		});
	};
	if ((data?.version ?? 0) < 4 || !connectionId) return null;
	return (
		<>
			<Button
				size="sm"
				variant="ghost"
				className="h-8 gap-1.5 px-2 text-xs"
				title={t({ message: "Automations" })}
				onClick={() => {
					resetForm();
					setQuery(jql);
					setFilters({ ...initialFilters, forkJql: undefined });
					setAdvanced(!!initialFilters.forkJql);
					setOpen(true);
				}}
			>
				<LuZap className="size-3.5" />
				<span className="hidden @3xl:inline">
					<Trans>Automations</Trans>
				</span>
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-h-[85vh] overflow-auto sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>
							<Trans>Jira automations</Trans>
						</DialogTitle>
					</DialogHeader>
					<p className="text-xs text-muted-foreground">
						<Trans>
							These automations run on this computer, not in the cloud. The host
							checks every minute. Enabling a rule records what already matches;
							only later matches start an agent. Rules are saved paused.
						</Trans>
					</p>
					{(rules.error ||
						projects.error ||
						jiraProjects.error ||
						mutation.error) && (
						<p role="alert" className="text-sm text-destructive">
							{
								(
									rules.error ??
									projects.error ??
									jiraProjects.error ??
									mutation.error
								)?.message
							}
						</p>
					)}
					{v2 && <ForkAutomationLimits />}
					<div className="space-y-2">
						{rules.data?.map((rule) => (
							<ForkAutomationRuleCard
								key={rule.id}
								rule={rule}
								onEdit={() => startEdit(rule)}
							/>
						))}
					</div>
					<form
						className="space-y-3 border-t pt-4"
						onSubmit={(event) => {
							event.preventDefault();
							mutation.mutate();
						}}
					>
						<div className="flex items-center gap-2">
							<h3 className="flex-1 text-sm font-medium">
								{editingId ? (
									<Trans>Edit automation</Trans>
								) : (
									<Trans>New automation</Trans>
								)}
							</h3>
							{editingId && (
								<Button
									type="button"
									size="xs"
									variant="ghost"
									onClick={resetForm}
								>
									<Trans>Cancel</Trans>
								</Button>
							)}
						</div>
						{v2 && (
							<>
								{!editingId && (
									<>
										<Label htmlFor="fork-automation-template">
											<Trans>Start from a template</Trans>
										</Label>
										<select
											id="fork-automation-template"
											className="h-9 w-full rounded-md border bg-background px-2 text-sm"
											value=""
											onChange={(e) => applyTemplate(e.target.value)}
										>
											<option value="">{t({ message: "Empty" })}</option>
											{FORK_AUTOMATION_TEMPLATES.map((template) => (
												<option key={template.id} value={template.id}>
													{i18n._(template.name)} ·{" "}
													{i18n._(template.description)}
												</option>
											))}
										</select>
									</>
								)}
								<Label htmlFor="fork-automation-source">
									<Trans>When</Trans>
								</Label>
								<select
									id="fork-automation-source"
									className="h-9 w-full rounded-md border bg-background px-2 text-sm"
									value={options.sourceKind}
									onChange={(e) =>
										setOptions((current) => ({
											...current,
											sourceKind:
												FORK_AUTOMATION_SOURCES.find(
													(source) => source.kind === e.target.value,
												)?.kind ?? "jira",
										}))
									}
								>
									{FORK_AUTOMATION_SOURCES.map((source) => (
										<option key={source.kind} value={source.kind}>
											{i18n._(source.label)}
										</option>
									))}
								</select>
								{sourceInfo && (
									<p className="text-xs text-muted-foreground">
										{i18n._(sourceInfo.description)}
									</p>
								)}
							</>
						)}
						<Label htmlFor="jira-rule-name">
							<Trans>Name</Trans>
						</Label>
						<Input
							id="jira-rule-name"
							required
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
						{isJira && (
							<>
								<div className="flex gap-2">
									<Button
										type="button"
										size="sm"
										variant={!advanced ? "secondary" : "ghost"}
										aria-pressed={!advanced}
										onClick={() => setAdvanced(false)}
									>
										<Trans>Filters</Trans>
									</Button>
									<Button
										type="button"
										size="sm"
										variant={advanced ? "secondary" : "ghost"}
										aria-pressed={advanced}
										disabled={!advanced && filtersUnavailable}
										onClick={() => {
											if (!advanced) setQuery(generatedQuery);
											setAdvanced(true);
										}}
									>
										JQL
									</Button>
								</div>
								{advanced ? (
									<>
										<Label htmlFor="jira-rule-query">JQL</Label>
										<Textarea
											id="jira-rule-query"
											required
											value={query}
											onChange={(e) => setQuery(e.target.value)}
										/>
									</>
								) : (
									<ForkJiraAutomationFilters
										filters={filters}
										update={(patch) =>
											setFilters((current) => ({ ...current, ...patch }))
										}
										projects={jiraProjects.data ?? []}
										context={boardContext}
									/>
								)}
								{!advanced && (
									<p className="break-all font-mono text-xs text-muted-foreground">
										{generatedQuery}
									</p>
								)}
							</>
						)}

						<Label htmlFor="jira-rule-project">
							<Trans>Project</Trans>
						</Label>
						<select
							id="jira-rule-project"
							required
							className="h-9 w-full rounded-md border bg-background px-2 text-sm"
							value={projectId}
							onChange={(e) => setProjectId(e.target.value)}
						>
							<option value="" />
							{projects.data?.map((project) => (
								<option key={project.id} value={project.id}>
									{project.name}
								</option>
							))}
						</select>
						<ForkJiraAutomationAgent
							value={choice}
							onChange={setChoice}
							supported={launchSupported}
						/>
						{v2 && (
							<ForkAutomationOptions
								value={options}
								onChange={(patch) =>
									setOptions((current) => ({ ...current, ...patch }))
								}
							/>
						)}
						<Label htmlFor="jira-rule-prompt">
							<Trans>Instructions</Trans>
						</Label>
						<Textarea
							id="jira-rule-prompt"
							required
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							placeholder={t({ message: "Describe what the agent should do" })}
						/>
						<Button
							type="submit"
							disabled={
								mutation.isPending ||
								(isJira && !advanced && filtersUnavailable)
							}
						>
							<Trans>Save</Trans>
						</Button>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}
