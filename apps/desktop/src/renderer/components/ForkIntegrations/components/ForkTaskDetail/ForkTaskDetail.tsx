import { Trans, useLingui } from "@lingui/react/macro";
import type {
	ForkJiraColumn,
	ForkTask,
} from "@superset/shared/fork-integrations";
import { isForkServiceUnavailable } from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
	LuArrowUpRight,
	LuClock,
	LuEllipsis,
	LuPencil,
	LuTrash2,
	LuX,
} from "react-icons/lu";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { PullRequestPageBody } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestPageBody";
import { useForkConnections } from "../../hooks/useForkConnections";
import { required } from "../../utils/required";
import { ForkCommentComposer } from "../ForkCommentComposer";
import { ForkProviderIcon } from "../ForkProviderIcon";
import { ForkRelativeTime } from "../ForkRelativeTime";
import { ForkServiceNotice } from "../ForkServiceNotice";
import { ForkTaskStatus } from "../ForkTaskStatus";
import { ForkUserAvatar } from "../ForkUserAvatar";
import { ForkTaskInfo } from "./components/ForkTaskInfo";
import { ForkTaskWorklog } from "./components/ForkTaskWorklog";
import { ForkTaskWorkspaces } from "./components/ForkTaskWorkspaces";
import {
	type ForkTaskDraft,
	type ForkTaskEditField,
	forkTaskDraft,
	forkTaskEditConflicts,
	forkTaskEditPatch,
} from "./utils/forkTaskEditPatch";

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
	const [edit, setEdit] = useState<{
		base: ForkTaskDraft;
		draft: ForkTaskDraft;
	} | null>(null);
	const [conflict, setConflict] = useState<ForkTaskEditField[] | null>(null);
	const editing = edit !== null;
	const draft = edit?.draft ?? forkTaskDraft(task);
	const setField = (field: ForkTaskEditField, value: string) =>
		setEdit((current) =>
			current
				? { ...current, draft: { ...current.draft, [field]: value } }
				: null,
		);
	const startEdit = () => {
		const base = forkTaskDraft(task);
		setConflict(null);
		setEdit({ base, draft: base });
	};
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [logTime, setLogTime] = useState(false);
	const [assigneeQuery, setAssigneeQuery] = useState("");
	const taskKey = ["fork-integrations", hostUrl, "task", task.connectionId];
	const debouncedAssigneeQuery = useDebouncedValue(assigneeQuery, 300);
	const metadata = useQuery({
		refetchOnReconnect: true,
		networkMode: "always",
		retry: false,
		queryKey: ["fork-integrations", hostUrl, "edit-metadata", target],
		queryFn: () => required(client).forkTasks.editMetadata.query(target),
		enabled: !!client && editing,
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
		mutationFn: async ({
			kind,
			body,
			force,
		}: {
			kind: "save" | "comment" | "delete";
			body?: string;
			force?: boolean;
		}): Promise<"saved" | "unchanged" | "conflict" | undefined> => {
			if (!client) return;
			if (kind === "save") {
				if (!edit) return;
				const patch = forkTaskEditPatch(edit);
				if (Object.keys(patch).length === 0) return "unchanged";
				if (!force) {
					const fresh = await client.forkTasks.get.query(target);
					const fields = forkTaskEditConflicts({
						base: edit.base,
						fresh,
						patch,
					});
					if (fields.length > 0) {
						cache.setQueryData([...taskKey, task.key], fresh);
						setConflict(fields);
						return "conflict";
					}
				}
				await client.forkTasks.edit.mutate({ ...target, ...patch });
				return "saved";
			}
			if (kind === "comment")
				await client.forkTasks.comment.mutate({ ...target, body: body ?? "" });
			if (kind === "delete") {
				await client.forkTasks.remove.mutate(target);
				onBack();
			}
		},
		onSuccess: (result, { kind }) => {
			if (result === "conflict") return;
			if (kind === "save") {
				setEdit(null);
				setConflict(null);
				if (result === "saved") toast.success(t({ message: "Saved" }));
			}
			if (kind === "comment") {
				void comments.refetch();
				return;
			}
			if (kind === "delete") {
				void cache.invalidateQueries({ queryKey: taskKey });
				void cache.invalidateQueries({
					queryKey: ["fork-integrations", hostUrl, "tasks", task.connectionId],
				});
				return;
			}
			if (result !== "saved") return;
			void cache.invalidateQueries({ queryKey: taskKey });
			void cache.invalidateQueries({
				queryKey: ["fork-integrations", hostUrl, "tasks", task.connectionId],
			});
		},
	});
	const unavailable = [
		action.error,
		metadata.error,
		assignees.error,
		comments.error,
	].some(isForkServiceUnavailable);
	const cancelEdit = () => {
		setEdit(null);
		setConflict(null);
	};
	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			<div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
				<Button
					variant="ghost"
					size="icon-xs"
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
					className="group inline-flex min-w-0 items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
				>
					<span className="truncate">{task.key}</span>
					<LuArrowUpRight className="size-3 shrink-0" />
				</a>
				<div className="ml-auto" />
				{!editing && (
					<Button size="xs" variant="outline" onClick={startEdit}>
						<LuPencil className="size-3.5" />
						<Trans>Edit</Trans>
					</Button>
				)}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							size="icon-xs"
							variant="ghost"
							aria-label={t({ message: "More actions" })}
						>
							<LuEllipsis className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-48">
						<DropdownMenuItem asChild>
							<a href={task.url} target="_blank" rel="noreferrer">
								<LuArrowUpRight />
								<Trans>Open in Jira</Trans>
							</a>
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => setLogTime(true)}>
							<LuClock />
							<Trans>Log time</Trans>
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							variant="destructive"
							onSelect={() => setConfirmDelete(true)}
						>
							<LuTrash2 />
							<Trans>Delete task</Trans>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			{(unavailable ||
				confirmDelete ||
				conflict ||
				(action.isError && !isForkServiceUnavailable(action.error))) && (
				<div className="space-y-2 border-b px-4 py-3">
					{unavailable && (
						<ForkServiceNotice
							provider="jira"
							onRetry={() => {
								void metadata.refetch();
								void comments.refetch();
							}}
						/>
					)}
					{confirmDelete && (
						<div
							role="alert"
							className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
						>
							<span className="min-w-0 flex-1">
								<Trans>Delete {task.key} in Jira?</Trans>
							</span>
							<Button
								size="xs"
								variant="ghost"
								onClick={() => setConfirmDelete(false)}
							>
								<Trans>Cancel</Trans>
							</Button>
							<Button
								size="xs"
								variant="destructive"
								disabled={action.isPending}
								onClick={() => action.mutate({ kind: "delete" })}
							>
								<Trans>Confirm delete</Trans>
							</Button>
						</div>
					)}
					{conflict && (
						<div
							role="alert"
							className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm"
						>
							<span className="min-w-0 flex-1">
								<Trans>
									Someone changed this issue in Jira while you were editing.
									Your save would replace their changes.
								</Trans>
							</span>
							<Button size="xs" variant="ghost" onClick={startEdit}>
								<Trans>Discard my changes</Trans>
							</Button>
							<Button
								size="xs"
								variant="outline"
								disabled={action.isPending}
								onClick={() => action.mutate({ kind: "save", force: true })}
							>
								<Trans>Save anyway</Trans>
							</Button>
						</div>
					)}
					{action.isError && !isForkServiceUnavailable(action.error) && (
						<p role="alert" className="text-sm text-destructive">
							{action.error.message}
						</p>
					)}
				</div>
			)}
			<PullRequestPageBody
				header={
					<header className="shrink-0 pb-4">
						<div className="flex min-w-0 items-center gap-2">
							<ForkTaskStatus task={task} columns={columns} />
						</div>
						{editing ? (
							<Input
								aria-label={t({ message: "Title" })}
								value={draft.title}
								onChange={(e) => setField("title", e.target.value)}
								className="mt-3 h-auto py-1.5 text-xl font-semibold"
							/>
						) : (
							<h1 className="mt-3 select-text break-words text-[1.75rem] font-semibold leading-tight tracking-tight @max-[48rem]/detail:text-2xl @max-[36rem]/detail:mt-2 @max-[36rem]/detail:text-xl">
								{task.title}
							</h1>
						)}
					</header>
				}
				info={(variant) => <ForkTaskInfo task={task} variant={variant} />}
			>
				{editing ? (
					<section className="space-y-4 rounded-xl border border-border/60 bg-muted/10 p-4">
						<Textarea
							aria-label={t({ message: "Description" })}
							value={draft.description}
							onChange={(e) => setField("description", e.target.value)}
							className="min-h-40"
						/>
						<Input
							aria-label={t({ message: "Labels" })}
							placeholder={t({ message: "Labels" })}
							value={draft.labels}
							onChange={(e) => setField("labels", e.target.value)}
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
										value={draft.priorityId}
										onChange={(e) => setField("priorityId", e.target.value)}
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
										placeholder={t({ message: "Search" })}
										value={assigneeQuery}
										onChange={(e) => setAssigneeQuery(e.target.value)}
									/>
									<select
										id="jira-assignee"
										className="h-9 w-full rounded-md border bg-background px-2 text-sm"
										value={draft.assigneeId}
										onChange={(e) => setField("assigneeId", e.target.value)}
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
						<div className="flex justify-end gap-2">
							<Button size="sm" variant="ghost" onClick={cancelEdit}>
								<Trans>Cancel</Trans>
							</Button>
							<Button
								size="sm"
								disabled={action.isPending || !draft.title.trim()}
								onClick={() => action.mutate({ kind: "save" })}
							>
								<Trans>Save</Trans>
							</Button>
						</div>
					</section>
				) : task.description ? (
					<MarkdownRenderer
						content={task.description}
						allowHtml={false}
						className="h-auto overflow-visible text-sm [&_article]:max-w-none [&_article]:p-0"
					/>
				) : (
					<p className="text-sm italic text-muted-foreground">
						<Trans>No description provided.</Trans>
					</p>
				)}
				<div className="mt-8">
					<ForkTaskWorkspaces task={task} />
				</div>
				<ForkTaskWorklog
					task={task}
					formOpen={logTime}
					onFormOpenChange={setLogTime}
				/>
				<section className="mt-8 space-y-3">
					<h2 className="text-sm font-medium">
						<Trans>Activity</Trans>
					</h2>
					{comments.data?.map((c) => (
						<article
							className="flex min-w-0 gap-3 rounded-xl border border-border/60 bg-background px-3 py-3 shadow-sm"
							key={c.id}
						>
							<ForkUserAvatar name={c.author} className="mt-0.5" />
							<div className="min-w-0 flex-1 space-y-1">
								<p className="flex min-w-0 items-center gap-1.5 text-xs">
									<span className="truncate font-medium">{c.author}</span>
									<span className="text-muted-foreground">
										<ForkRelativeTime value={c.createdAt} />
									</span>
								</p>
								<MarkdownRenderer
									content={c.body}
									allowHtml={false}
									className="h-auto overflow-visible text-sm [&_article]:max-w-none [&_article]:p-0"
								/>
							</div>
						</article>
					))}
					{comments.isError && !isForkServiceUnavailable(comments.error) && (
						<p role="alert" className="text-xs text-destructive">
							{comments.error.message}
						</p>
					)}
					<ForkCommentComposer
						disabled={action.isPending}
						onSubmit={(body) => action.mutateAsync({ kind: "comment", body })}
					/>
				</section>
			</PullRequestPageBody>
		</div>
	);
}
