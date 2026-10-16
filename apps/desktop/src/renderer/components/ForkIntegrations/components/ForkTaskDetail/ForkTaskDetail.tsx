import { Trans, useLingui } from "@lingui/react/macro";
import type { ForkTask } from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Textarea } from "@superset/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForkConnections } from "../../hooks/useForkConnections";
import { required } from "../../utils/required";
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
		navigate = useNavigate();
	const target = { connectionId: task.connectionId, key: task.key };
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
	const metadata = useQuery({
		queryKey: ["fork-integrations", hostUrl, "edit-metadata", target],
		queryFn: () => required(client).forkTasks.editMetadata.query(target),
		enabled: !!client,
	});
	const assignees = useQuery({
		queryKey: [
			"fork-integrations",
			hostUrl,
			"assignees",
			target,
			assigneeQuery,
		],
		queryFn: () =>
			required(client).forkTasks.assignees.query({
				...target,
				query: assigneeQuery,
			}),
		enabled: !!client && metadata.data?.canAssign === true,
	});
	const [createId] = useState(() => crypto.randomUUID());
	const transitions = useQuery({
		queryKey: ["fork-integrations", hostUrl, "transitions", target],
		queryFn: () => required(client).forkTasks.transitions.query(target),
		enabled: !!client,
	});
	const comments = useQuery({
		queryKey: ["fork-integrations", hostUrl, "comments", target],
		queryFn: () => required(client).forkTasks.comments.query(target),
		enabled: !!client,
	});
	const projects = useQuery({
		queryKey: ["fork-integrations", hostUrl, "projects"],
		queryFn: () => required(client).project.list.query(),
		enabled: !!client,
	});
	const workspaces = useQuery({
		queryKey: ["fork-integrations", hostUrl, "workspaces"],
		queryFn: () => required(client).workspace.list.query(),
		enabled: !!client,
	});
	const action = useMutation({
		mutationFn: async (
			kind: "save" | "comment" | "transition" | "delete" | "create" | "link",
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
					labels: labels
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
			if (kind === "create") {
				const result = await client.forkTasks.createWorkspace.mutate({
					...target,
					projectId,
					workspaceId: createId,
				});
				await navigate({
					to: "/v2-workspace/$workspaceId",
					params: { workspaceId: result.workspaceId },
				});
			}
		},
		onSuccess: () => {
			void cache.invalidateQueries({ queryKey: ["fork-integrations"] });
		},
	});
	const selectedTransition = transitions.data?.find((v) => v.id === transition);
	return (
		<div className="mx-auto w-full max-w-4xl space-y-6 p-6">
			<div className="flex flex-wrap items-center gap-3">
				<Button variant="ghost" size="sm" onClick={onBack}>
					<Trans>Back</Trans>
				</Button>
				<a
					href={task.url}
					target="_blank"
					rel="noreferrer"
					className="text-sm font-medium text-primary"
				>
					{task.key}
				</a>
				<span className="rounded-full bg-muted px-3 py-1 text-xs">
					{task.status.name}
				</span>
			</div>
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
								!assignees.data?.some((u) => u.id === task.assignee?.id) && (
									<option value={task.assignee.id}>{task.assignee.name}</option>
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
				{transitions.isError && (
					<p role="alert" className="text-xs text-destructive">
						{transitions.error.message}
					</p>
				)}
			</section>
			<section className="space-y-3 rounded-lg border p-4">
				<h3 className="text-sm font-medium">
					<Trans>Workspaces</Trans>
				</h3>
				<div className="flex flex-wrap gap-2">
					<select
						aria-label={t({ message: "Project" })}
						className="h-9 rounded-md border bg-background px-2 text-sm"
						value={projectId}
						onChange={(e) => setProjectId(e.target.value)}
					>
						<option value="">{t({ message: "Select project" })}</option>
						{projects.data?.map((p) => (
							<option key={p.id} value={p.id}>
								{p.name}
							</option>
						))}
					</select>
					<Button
						disabled={!projectId || action.isPending}
						onClick={() => action.mutate("create")}
					>
						<Trans>Create workspace</Trans>
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
						<p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
					</article>
				))}
				{comments.isError && (
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
			<div className="flex gap-2 border-t pt-4">
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
			{action.isError && (
				<p role="alert" className="text-sm text-destructive">
					{action.error.message}
				</p>
			)}
		</div>
	);
}
