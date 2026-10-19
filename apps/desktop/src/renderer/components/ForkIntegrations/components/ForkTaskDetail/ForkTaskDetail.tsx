import { Trans, useLingui } from "@lingui/react/macro";
import type { ForkTask } from "@superset/shared/fork-integrations";
import {
	forkTaskBranch,
	isForkServiceUnavailable,
} from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
	LuArrowUpRight,
	LuGitBranch,
	LuPencil,
	LuUnlink,
	LuX,
} from "react-icons/lu";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { useOpenNewWorkspace } from "renderer/hooks/useOpenNewWorkspace";
import { useNewWorkspaceDraftStore } from "renderer/stores/new-workspace-draft";
import { useForkConnections } from "../../hooks/useForkConnections";
import { forkJiraLinkedIssue } from "../../utils/forkJiraWorkspace";
import { required } from "../../utils/required";
import { jiraStatusTone } from "../ForkJiraTasks/fork-jira-query";
import { ForkProviderIcon } from "../ForkProviderIcon";
import { ForkServiceNotice } from "../ForkServiceNotice";
import { ForkTransitionFields } from "../ForkTransitionFields/ForkTransitionFields";

export function ForkTaskDetail({
	task,
	onBack,
}: {
	task: ForkTask;
	onBack: () => void;
}) {
	const { t } = useLingui(),
		{ client, hostUrl } = useForkConnections(),
		cache = useQueryClient(),
		navigate = useNavigate(),
		openNewWorkspace = useOpenNewWorkspace();
	const target = { connectionId: task.connectionId, key: task.key };
	const [editing, setEditing] = useState(false);
	const [title, setTitle] = useState(task.title),
		[description, setDescription] = useState(task.description),
		[labels, setLabels] = useState(task.labels.join(", "));
	const [body, setBody] = useState(""),
		[transition, setTransition] = useState(""),
		[fields, setFields] = useState<Record<string, unknown>>({});
	const [confirmDelete, setConfirmDelete] = useState(false),
		[projectId, setProjectId] = useState(""),
		[workspaceId, setWorkspaceId] = useState("");
	const [assigneeId, setAssigneeId] = useState(task.assignee?.id ?? ""),
		[assigneeQuery, setAssigneeQuery] = useState(""),
		[priorityId, setPriorityId] = useState(task.priorityId ?? "");
	const debouncedAssigneeQuery = useDebouncedValue(assigneeQuery, 300);
	const metadata = useQuery({
		refetchOnReconnect: true,
		networkMode: "always",
		retry: false,
		queryKey: ["fork-integrations", hostUrl, "edit-metadata", target],
		queryFn: () => required(client).forkTasks.editMetadata.query(target),
		enabled: !!client,
	});
	const assignees = useQuery({
		refetchOnReconnect: true,
		networkMode: "always",
		retry: false,
		queryKey: [
			"fork-integrations",
			hostUrl,
			"assignees",
			target,
			debouncedAssigneeQuery,
		],
		queryFn: () =>
			required(client).forkTasks.assignees.query({
				...target,
				query: debouncedAssigneeQuery,
			}),
		enabled: !!client && editing && metadata.data?.canAssign === true,
	});
	const transitions = useQuery({
		refetchOnReconnect: true,
		networkMode: "always",
		retry: false,
		queryKey: ["fork-integrations", hostUrl, "transitions", target],
		queryFn: () => required(client).forkTasks.transitions.query(target),
		enabled: !!client,
	});
	const comments = useQuery({
		refetchOnReconnect: true,
		networkMode: "always",
		retry: false,
		queryKey: ["fork-integrations", hostUrl, "comments", target],
		queryFn: () => required(client).forkTasks.comments.query(target),
		enabled: !!client,
	});
	const projects = useQuery({
		refetchOnReconnect: true,
		networkMode: "always",
		retry: false,
		queryKey: ["fork-integrations", hostUrl, "projects"],
		queryFn: () => required(client).project.list.query(),
		enabled: !!client,
	});
	const workspaces = useQuery({
		refetchOnReconnect: true,
		networkMode: "always",
		retry: false,
		queryKey: ["fork-integrations", hostUrl, "workspaces"],
		queryFn: () => required(client).workspace.list.query(),
		enabled: !!client,
	});
	const action = useMutation({
		networkMode: "always",
		retry: false,
		mutationFn: async (
			kind: "save" | "comment" | "transition" | "delete" | "link",
		) => {
			if (!client) return;
			if (kind === "save")
				return client.forkTasks.edit.mutate({
					...target,
					title,
					description:
						description === task.description ? undefined : description,
					assigneeId:
						assigneeId === (task.assignee?.id ?? "")
							? undefined
							: assigneeId || null,
					priorityId:
						priorityId && priorityId !== task.priorityId
							? priorityId
							: undefined,
					labels:
						labels === task.labels.join(", ")
							? undefined
							: labels
									.split(",")
									.map((s) => s.trim())
									.filter(Boolean),
				});
			if (kind === "comment") {
				await client.forkTasks.comment.mutate({ ...target, body });
				setBody("");
			}
			if (kind === "transition")
				await client.forkTasks.transition.mutate({
					...target,
					transitionId: transition,
					fields,
				});
			if (kind === "delete") {
				await client.forkTasks.remove.mutate(target);
				onBack();
			}
			if (kind === "link")
				await client.forkTasks.link.mutate({ ...target, workspaceId });
		},
		onSuccess: (_, kind) => {
			if (kind === "save") {
				setEditing(false);
				toast.success(t({ message: "Saved" }));
			}
			if (kind === "link")
				toast.success(t({ message: "Task linked to workspace." }));
			if (kind === "transition") {
				setTransition("");
				setFields({});
			}
			void cache.invalidateQueries({ queryKey: ["fork-integrations"] });
		},
	});
	const unavailable = [
		action.error,
		metadata.error,
		assignees.error,
		transitions.error,
		comments.error,
	].some(isForkServiceUnavailable);
	const linkedWorkspaces = useQuery({
		refetchOnReconnect: true,
		networkMode: "always",
		retry: false,
		queryKey: ["fork-integrations", hostUrl, "task-workspaces", target],
		queryFn: () =>
			required(client).forkTasks.workspaces.query({
				connectionId: task.connectionId,
				taskId: task.id,
			}),
		enabled: !!client,
	});
	const unlink = useMutation({
		networkMode: "always",
		retry: false,
		mutationFn: (workspaceId: string) =>
			required(client).forkTasks.unlink.mutate({
				workspaceId,
				connectionId: task.connectionId,
				taskId: task.id,
			}),
		onSettled: () =>
			void cache.invalidateQueries({ queryKey: ["fork-integrations"] }),
	});
	const startInWorkspace = () => {
		const drafts = useNewWorkspaceDraftStore.getState();
		drafts.resetDraft();
		drafts.updateDraft({
			linkedIssues: [forkJiraLinkedIssue(task)],
			branchName: forkTaskBranch(task.key, task.title, task.type?.name),
			branchNameEdited: true,
			branchNameFromProvider: false,
			workspaceName: `${task.key} ${task.title}`,
			workspaceNameEdited: true,
		});
		openNewWorkspace(projectId || null);
	};
	const selectedTransition = transitions.data?.find((v) => v.id === transition);
	return (
		<div className="mx-auto w-full min-w-0 max-w-4xl space-y-6 p-5">
			{unavailable && (
				<ForkServiceNotice
					provider="jira"
					onRetry={() => {
						void metadata.refetch();
						void transitions.refetch();
						void comments.refetch();
					}}
				/>
			)}
			<div className="flex flex-wrap items-center gap-3">
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={t({ message: "Close" })}
					onClick={onBack}
				>
					<LuX className="size-4" />
				</Button>
				<ForkProviderIcon provider="jira" />
				<a
					href={task.url}
					target="_blank"
					rel="noreferrer"
					className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
				>
					{task.key}
					<LuArrowUpRight className="size-3" />
				</a>
				<span
					className={cn(
						"rounded-md px-2 py-1 text-[11px]",
						jiraStatusTone(task.status.category),
					)}
				>
					{task.status.name}
				</span>
			</div>
			{!editing && (
				<section className="space-y-4">
					<div className="flex items-start gap-3">
						<h2 className="min-w-0 flex-1 break-words text-xl font-semibold leading-snug">
							{task.title}
						</h2>
						<Button
							size="icon-sm"
							variant="ghost"
							aria-label={t({ message: "Edit" })}
							onClick={() => setEditing(true)}
						>
							<LuPencil className="size-3.5" />
						</Button>
					</div>
					<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
						{task.type && (
							<span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1">
								{task.type.iconUrl && (
									<img alt="" className="size-3.5" src={task.type.iconUrl} />
								)}
								{task.type.name}
							</span>
						)}
						{task.parent && (
							<span
								className="max-w-64 truncate rounded-md border px-2 py-1"
								title={task.parent.title}
							>
								{task.parent.key} · {task.parent.title}
							</span>
						)}
						{task.sprint && (
							<span className="rounded-md border px-2 py-1">{task.sprint}</span>
						)}
						{task.assignee && (
							<span className="rounded-md border px-2 py-1">
								{task.assignee.name}
							</span>
						)}
						{task.priority && (
							<span className="rounded-md border px-2 py-1">
								{task.priority}
							</span>
						)}
						{task.labels.map((label) => (
							<span key={label} className="rounded-md bg-muted px-2 py-1">
								{label}
							</span>
						))}
					</div>
					{task.description && (
						<MarkdownRenderer
							content={task.description}
							allowHtml={false}
							className="h-auto overflow-visible text-sm [&_article]:max-w-none [&_article]:p-0"
						/>
					)}
				</section>
			)}
			{editing && (
				<section className="space-y-4 rounded-xl border bg-muted/10 p-4">
					<Input
						aria-label={t({ message: "Title" })}
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						className="text-lg font-medium"
					/>
					<Textarea
						aria-label={t({ message: "Description" })}
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						className="min-h-40"
					/>
					<Input
						aria-label={t({ message: "Labels" })}
						placeholder={t({ message: "Labels" })}
						value={labels}
						onChange={(e) => setLabels(e.target.value)}
					/>
					<div className="grid gap-4 sm:grid-cols-2">
						{!!metadata.data?.priorities.length && (
							<div className="space-y-1">
								<Label htmlFor="jira-priority">
									<Trans>Priority</Trans>
								</Label>
								<select
									id="jira-priority"
									className="h-9 w-full rounded-md border bg-background px-2 text-sm"
									value={priorityId}
									onChange={(e) => setPriorityId(e.target.value)}
								>
									{metadata.data.priorities.map((p) => (
										<option key={p.id} value={p.id}>
											{p.name}
										</option>
									))}
								</select>
							</div>
						)}
						{metadata.data?.canAssign && (
							<div className="space-y-1">
								<Label htmlFor="jira-assignee">
									<Trans>Assignee</Trans>
								</Label>
								<Input
									aria-label={t({ message: "Search" })}
									value={assigneeQuery}
									onChange={(e) => setAssigneeQuery(e.target.value)}
								/>
								<select
									id="jira-assignee"
									className="h-9 w-full rounded-md border bg-background px-2 text-sm"
									value={assigneeId}
									onChange={(e) => setAssigneeId(e.target.value)}
								>
									<option value="">{t({ message: "Unassigned" })}</option>
									{task.assignee &&
										!assignees.data?.some(
											(u) => u.id === task.assignee?.id,
										) && (
											<option value={task.assignee.id}>
												{task.assignee.name}
											</option>
										)}
									{assignees.data?.map((u) => (
										<option key={u.id} value={u.id}>
											{u.name}
										</option>
									))}
								</select>
							</div>
						)}
					</div>
					<Button
						disabled={action.isPending || !title.trim()}
						onClick={() => action.mutate("save")}
					>
						<Trans>Save</Trans>
					</Button>
					<Button
						variant="ghost"
						className="ml-2"
						onClick={() => {
							setTitle(task.title);
							setDescription(task.description);
							setLabels(task.labels.join(", "));
							setAssigneeId(task.assignee?.id ?? "");
							setPriorityId(task.priorityId ?? "");
							setEditing(false);
						}}
					>
						<Trans>Cancel</Trans>
					</Button>
				</section>
			)}
			<section className="space-y-3 rounded-lg border p-4">
				<h3 className="text-sm font-medium">
					<Trans>Status</Trans>
				</h3>
				<div className="flex gap-2">
					<select
						className="h-9 min-w-40 rounded-md border bg-background px-2 text-sm"
						aria-label={t({ message: "Status" })}
						value={transition}
						onChange={(e) => {
							setTransition(e.target.value);
							setFields({});
						}}
					>
						<option value="">{task.status.name}</option>
						{transitions.data?.map((v) => (
							<option key={v.id} value={v.id}>
								{v.name}
							</option>
						))}
					</select>
					<Button
						variant="outline"
						disabled={!transition || action.isPending}
						onClick={() => action.mutate("transition")}
					>
						<Trans>Apply</Trans>
					</Button>
				</div>
				{!!selectedTransition?.fields.length && (
					<ForkTransitionFields
						fields={selectedTransition.fields}
						values={fields}
						onChange={setFields}
					/>
				)}
				{transitions.isError &&
					!isForkServiceUnavailable(transitions.error) && (
						<p role="alert" className="text-xs text-destructive">
							{transitions.error.message}
						</p>
					)}
			</section>
			<section className="space-y-3 rounded-xl border border-primary/15 bg-primary/[0.025] p-4">
				<h3 className="text-sm font-medium">
					<span className="inline-flex items-center gap-2">
						<LuGitBranch className="size-3.5 text-primary" />
						<Trans>Workspaces</Trans>
					</span>
				</h3>
				{linkedWorkspaces.data && linkedWorkspaces.data.length > 0 && (
					<ul className="space-y-1">
						{linkedWorkspaces.data.map((w) => (
							<li key={w.id} className="flex items-center gap-1">
								<Button
									size="sm"
									variant="ghost"
									className="min-w-0 flex-1 justify-start"
									onClick={() =>
										void navigate({
											to: "/v2-workspace/$workspaceId",
											params: { workspaceId: w.id },
										})
									}
								>
									<span className="truncate">{w.name || w.id}</span>
								</Button>
								<Button
									size="icon-sm"
									variant="ghost"
									aria-label={t({ message: "Unlink" })}
									disabled={unlink.isPending}
									onClick={() => unlink.mutate(w.id)}
								>
									<LuUnlink className="size-3.5" />
								</Button>
							</li>
						))}
					</ul>
				)}
				<div className="flex flex-wrap gap-2">
					<select
						aria-label={t({ message: "Project" })}
						className="h-9 rounded-md border bg-background px-2 text-sm"
						value={projectId}
						onChange={(e) => setProjectId(e.target.value)}
					>
						<option value="">{t({ message: "Choose project later" })}</option>
						{projects.data?.map((p) => (
							<option key={p.id} value={p.id}>
								{p.name}
							</option>
						))}
					</select>
					<Button onClick={startInWorkspace}>
						<Trans>Start in workspace</Trans>
					</Button>
				</div>
				<div className="flex flex-wrap gap-2">
					<select
						aria-label={t({ message: "Workspace" })}
						className="h-9 rounded-md border bg-background px-2 text-sm"
						value={workspaceId}
						onChange={(e) => setWorkspaceId(e.target.value)}
					>
						<option value="">{t({ message: "Select workspace" })}</option>
						{workspaces.data?.map((p) => (
							<option key={p.id} value={p.id}>
								{p.name}
							</option>
						))}
					</select>
					<Button
						variant="outline"
						disabled={!workspaceId || action.isPending}
						onClick={() => action.mutate("link")}
					>
						<Trans>Link</Trans>
					</Button>
				</div>
			</section>
			<section className="space-y-3">
				<h3 className="text-sm font-medium">
					<Trans>Comments</Trans>
				</h3>
				{comments.data?.map((c) => (
					<article className="rounded-lg border p-4" key={c.id}>
						<p className="mb-2 text-xs font-medium">{c.author}</p>
						<MarkdownRenderer
							content={c.body}
							allowHtml={false}
							className="h-auto overflow-visible text-sm [&_article]:max-w-none [&_article]:p-0"
						/>
					</article>
				))}
				{comments.isError && !isForkServiceUnavailable(comments.error) && (
					<p role="alert" className="text-xs text-destructive">
						{comments.error.message}
					</p>
				)}
				<Textarea
					aria-label={t({ message: "Comment" })}
					value={body}
					onChange={(e) => setBody(e.target.value)}
				/>
				<Button
					disabled={!body.trim() || action.isPending}
					onClick={() => action.mutate("comment")}
				>
					<Trans>Add comment</Trans>
				</Button>
			</section>
			<details className="border-t pt-4">
				<summary className="cursor-pointer text-xs text-muted-foreground">
					<Trans>Delete task</Trans>
				</summary>
				<div className="mt-3 flex gap-2">
					<Button
						variant="destructive"
						disabled={action.isPending}
						onClick={() =>
							confirmDelete ? action.mutate("delete") : setConfirmDelete(true)
						}
					>
						{confirmDelete ? (
							<Trans>Confirm delete</Trans>
						) : (
							<Trans>Delete task</Trans>
						)}
					</Button>
					{confirmDelete && (
						<Button variant="ghost" onClick={() => setConfirmDelete(false)}>
							<Trans>Cancel</Trans>
						</Button>
					)}
				</div>
			</details>
			{action.isError && !isForkServiceUnavailable(action.error) && (
				<p role="alert" className="text-sm text-destructive">
					{action.error.message}
				</p>
			)}
		</div>
	);
}
