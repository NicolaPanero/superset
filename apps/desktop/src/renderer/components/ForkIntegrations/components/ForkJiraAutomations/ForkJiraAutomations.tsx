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
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { useForkConnections } from "../../hooks/useForkConnections";
import { required } from "../../utils/required";

export function ForkJiraAutomations({
	connectionId,
	jql,
}: {
	connectionId: string;
	jql: string;
}) {
	const { t } = useLingui();
	const { client, hostUrl, data } = useForkConnections();
	const cache = useQueryClient();
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [query, setQuery] = useState("");
	const [projectId, setProjectId] = useState("");
	const [agent, setAgent] = useState("");
	const [prompt, setPrompt] = useState("");
	const [historyId, setHistoryId] = useState("");
	const { data: agents = [] } = useV2AgentConfigs(open ? hostUrl : null);
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
	const runs = useQuery({
		queryKey: ["fork-integrations", hostUrl, "automation-runs", historyId],
		queryFn: () =>
			required(client).forkTasks.automationRuns.query({ id: historyId }),
		enabled: open && !!historyId,
		retry: false,
		refetchInterval: open ? 15000 : false,
	});
	const mutation = useMutation({
		networkMode: "always",
		retry: false,
		mutationFn: async (
			action:
				| { kind: "save" }
				| { kind: "enable"; id: string; enabled: boolean }
				| { kind: "delete"; id: string },
		) => {
			if (action.kind === "save")
				return required(client).forkTasks.automationCreate.mutate({
					connectionId,
					projectId,
					name,
					jql: query,
					agent,
					prompt,
				});
			if (action.kind === "enable")
				return required(client).forkTasks.automationEnable.mutate({
					id: action.id,
					enabled: action.enabled,
				});
			return required(client).forkTasks.automationDelete.mutate({
				id: action.id,
			});
		},
		onSuccess: (_, action) => {
			if (action.kind === "save") {
				setName("");
				setPrompt("");
			}
			void cache.invalidateQueries({
				queryKey: ["fork-integrations", hostUrl, "automations"],
			});
		},
	});
	if ((data?.version ?? 0) < 4 || !connectionId) return null;
	return (
		<>
			<Button
				size="sm"
				variant="ghost"
				onClick={() => {
					setQuery(jql);
					setOpen(true);
				}}
			>
				<Trans>Automations</Trans>
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
							The host checks every minute. Enabling a rule records existing
							matches; each new matching issue starts one workspace and agent.
							Rules are saved paused.
						</Trans>
					</p>
					{(rules.error || projects.error || mutation.error) && (
						<p role="alert" className="text-sm text-destructive">
							{(rules.error ?? projects.error ?? mutation.error)?.message}
						</p>
					)}
					<div className="space-y-2">
						{rules.data?.map((rule) => (
							<div key={rule.id} className="space-y-2 rounded-lg border p-3">
								<div className="flex flex-wrap items-center gap-2">
									<span className="flex-1 text-sm font-medium">
										{rule.name}
									</span>
									<Button
										size="sm"
										variant="outline"
										disabled={mutation.isPending}
										onClick={() =>
											mutation.mutate({
												kind: "enable",
												id: rule.id,
												enabled: !rule.enabled,
											})
										}
									>
										{rule.enabled ? (
											<Trans>Pause</Trans>
										) : (
											<Trans>Enable</Trans>
										)}
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => setHistoryId(rule.id)}
									>
										<Trans>Run history</Trans>
									</Button>
									<Button
										size="sm"
										variant="ghost"
										disabled={mutation.isPending}
										onClick={() =>
											mutation.mutate({ kind: "delete", id: rule.id })
										}
									>
										<Trans>Delete</Trans>
									</Button>
								</div>
								<p className="break-all font-mono text-xs text-muted-foreground">
									{rule.jql}
								</p>
								{rule.error && (
									<p role="alert" className="text-xs text-destructive">
										{rule.error}
									</p>
								)}
							</div>
						))}
					</div>
					{historyId && (
						<div className="space-y-2 rounded-lg border p-3">
							<h3 className="text-sm font-medium">
								<Trans>Run history</Trans>
							</h3>
							{runs.error && (
								<p role="alert" className="text-xs text-destructive">
									{runs.error.message}
								</p>
							)}
							{runs.data
								?.filter((run) => run.workspaceId || run.error)
								.map((run) => (
									<div
										key={`${run.taskKey}:${run.createdAt}`}
										className="text-xs"
									>
										{run.workspaceId ? (
											<Button
												size="sm"
												variant="link"
												onClick={() =>
													void navigate({
														to: "/v2-workspace/$workspaceId",
														params: { workspaceId: required(run.workspaceId) },
													})
												}
											>
												{run.taskKey}
											</Button>
										) : (
											run.taskKey
										)}
										{run.error && (
											<span className="text-destructive">{run.error}</span>
										)}
									</div>
								))}
						</div>
					)}
					<form
						className="space-y-3 border-t pt-4"
						onSubmit={(event) => {
							event.preventDefault();
							mutation.mutate({ kind: "save" });
						}}
					>
						<Label htmlFor="jira-rule-name">
							<Trans>Name</Trans>
						</Label>
						<Input
							id="jira-rule-name"
							required
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
						<Label htmlFor="jira-rule-query">JQL</Label>
						<Textarea
							id="jira-rule-query"
							required
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
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
						<Label htmlFor="jira-rule-agent">
							<Trans>Agent</Trans>
						</Label>
						<select
							id="jira-rule-agent"
							required
							className="h-9 w-full rounded-md border bg-background px-2 text-sm"
							value={agent}
							onChange={(e) => setAgent(e.target.value)}
						>
							<option value="" />
							{agents.map((config) => (
								<option key={config.id} value={config.id}>
									{config.label}
								</option>
							))}
						</select>
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
						<Button type="submit" disabled={mutation.isPending}>
							<Trans>Save</Trans>
						</Button>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}
