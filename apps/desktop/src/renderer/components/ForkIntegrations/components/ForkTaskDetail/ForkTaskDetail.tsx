import { Trans, useLingui } from "@lingui/react/macro";
import type {
	ForkJiraColumn,
	ForkTask,
} from "@superset/shared/fork-integrations";
import { isForkServiceUnavailable } from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuArrowUpRight, LuPencil, LuX } from "react-icons/lu";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { useForkConnections } from "../../hooks/useForkConnections";
import { required } from "../../utils/required";
import { ForkProviderIcon } from "../ForkProviderIcon";
import { ForkServiceNotice } from "../ForkServiceNotice";
import { ForkTaskStatus } from "../ForkTaskStatus";
import { ForkTaskWorkspaces } from "./components/ForkTaskWorkspaces";

export function ForkTaskDetail({
	task,
	columns,
	onBack,
}: {
	task: ForkTask;
	columns?: ForkJiraColumn[];
	onBack: () => void;
}) {
	const { t } = useLingui(),
		{ client, hostUrl } = useForkConnections(),
		cache = useQueryClient();
	const target = { connectionId: task.connectionId, key: task.key };
	const [editing, setEditing] = useState(false);
	const [title, setTitle] = useState(task.title),
		[description, setDescription] = useState(task.description),
		[labels, setLabels] = useState(task.labels.join(", "));
	const [body, setBody] = useState("");
	const [confirmDelete, setConfirmDelete] = useState(false);
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

	const comments = useQuery({
		refetchOnReconnect: true,
		networkMode: "always",
		retry: false,
		queryKey: ["fork-integrations", hostUrl, "comments", target],
		queryFn: () => required(client).forkTasks.comments.query(target),
		enabled: !!client,
	});
	const action = useMutation({
		networkMode: "always",
		retry: false,
		mutationFn: async (kind: "save" | "comment" | "delete") => {
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
			if (kind === "delete") {
				await client.forkTasks.remove.mutate(target);
				onBack();
			}
		},
		onSuccess: (_, kind) => {
			if (kind === "save") {
				setEditing(false);
				toast.success(t({ message: "Saved" }));
			}
			void cache.invalidateQueries({ queryKey: ["fork-integrations"] });
		},
	});
	const unavailable = [
		action.error,
		metadata.error,
		assignees.error,
		comments.error,
	].some(isForkServiceUnavailable);
	return (
		<div className="mx-auto w-full min-w-0 max-w-4xl space-y-6 p-5">
			{unavailable && (
				<ForkServiceNotice
					provider="jira"
					onRetry={() => {
						void metadata.refetch();
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
				<ForkTaskStatus task={task} columns={columns} />
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

			<ForkTaskWorkspaces task={task} />
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
