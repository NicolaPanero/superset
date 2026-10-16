import { Trans, useLingui } from "@lingui/react/macro";
import type { ForkPullRequest } from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Textarea } from "@superset/ui/textarea";
import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { useForkConnections } from "../../hooks/useForkConnections";

export function ForkPullRequestDetail({
	pullRequest,
	onBack,
}: {
	pullRequest: ForkPullRequest;
	onBack: () => void;
}) {
	const { t } = useLingui(),
		{ client, hostUrl } = useForkConnections(),
		cache = useQueryClient();
	const target = {
		connectionId: pullRequest.connectionId,
		repository: pullRequest.repository,
		number: pullRequest.number,
	};
	const key = ["fork-integrations", hostUrl, "pr", target];
	const [merging, setMerging] = useState(false);
	const detail = useQuery({
		queryKey: key,
		queryFn: () => client!.forkScm.get.query(target),
		initialData: pullRequest,
		enabled: !!client,
		refetchOnMount: "always",
		refetchInterval: (q) =>
			merging && q.state.data?.state === "open" ? 3000 : false,
	});
	const pr = detail.data;
	const [tab, setTab] = useState<"conversation" | "code" | "checks">(
			"conversation",
		),
		[body, setBody] = useState("");
	const [edit, setEdit] = useState(false),
		[title, setTitle] = useState(pr.title),
		[description, setDescription] = useState(pr.description);
	const [merge, setMerge] = useState(false),
		[method, setMethod] = useState<"merge_commit" | "squash" | "fast_forward">(
			(pullRequest.defaultMergeMethod as
				| "merge_commit"
				| "squash"
				| "fast_forward") ?? "merge_commit",
		);
	const [inlinePath, setInlinePath] = useState(""),
		[inlineLine, setInlineLine] = useState("");
	const comments = useInfiniteQuery({
		initialPageParam: undefined as string | undefined,
		queryKey: [...key, "comments"],
		queryFn: ({ pageParam }) =>
			client!.forkScm.comments.query({ ...target, cursor: pageParam }),
		getNextPageParam: (page) => page.nextCursor ?? undefined,
		enabled: !!client && tab === "conversation",
	});
	const diff = useQuery({
		queryKey: [...key, "diff"],
		queryFn: () => client!.forkScm.diff.query(target),
		enabled: !!client && tab === "code",
		retry: false,
	});
	const checks = useQuery({
		queryKey: [...key, "checks"],
		queryFn: () => client!.forkScm.checks.query(target),
		enabled: !!client && tab === "checks",
		retry: false,
	});
	const action = useMutation({
		mutationFn: (
			action:
				| "merge"
				| "close"
				| "reopen"
				| "approve"
				| "unapprove"
				| "comment"
				| "edit",
		) =>
			client!.forkScm.action.mutate({
				...target,
				action,
				head: pr.headCommit,
				method: pr.repository.provider === "github" ? "merge" : method,
				...(action === "edit" ? { title, body: description } : { body }),
				...(inlinePath && inlineLine
					? { path: inlinePath, line: Number(inlineLine) }
					: {}),
			}),
		onSuccess: (_, kind) => {
			if (kind === "merge") setMerging(true);
			setBody("");
			setEdit(false);
			setMerge(false);
			void cache.invalidateQueries({ queryKey: ["fork-integrations"] });
		},
	});
	const busy = action.isPending || (merging && pr.state === "open");
	return (
		<div className="min-w-0 flex-1 space-y-5 overflow-auto p-5">
			<div className="flex flex-wrap items-center gap-2">
				<Button size="sm" variant="ghost" onClick={onBack}>
					<Trans>Back</Trans>
				</Button>
				<a
					className="text-sm font-medium text-primary"
					href={pr.url}
					target="_blank"
					rel="noreferrer"
				>
					#{pr.number}
				</a>
				<span className="rounded-full bg-muted px-2 py-1 text-xs">
					{pr.state}
				</span>
				<span className="text-xs text-muted-foreground">{pr.author}</span>
			</div>
			<h2 className="text-xl font-semibold">{pr.title}</h2>
			<p className="break-all font-mono text-xs text-muted-foreground">
				{pr.sourceBranch} → {pr.targetBranch}
			</p>
			{edit ? (
				<div className="space-y-2">
					<Input
						aria-label={t({ message: "Title" })}
						value={title}
						onChange={(e) => setTitle(e.target.value)}
					/>
					<Textarea
						aria-label={t({ message: "Description" })}
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
					<Button
						size="sm"
						disabled={busy}
						onClick={() => action.mutate("edit")}
					>
						<Trans>Save</Trans>
					</Button>
				</div>
			) : (
				<p className="whitespace-pre-wrap break-words text-sm">
					{pr.description}
				</p>
			)}
			<div className="flex flex-wrap gap-2">
				<Button size="sm" variant="outline" onClick={() => setEdit(!edit)}>
					<Trans>Edit</Trans>
				</Button>
				{pr.state === "open" && (
					<>
						<Button
							size="sm"
							variant="outline"
							disabled={busy}
							onClick={() => action.mutate("approve")}
						>
							<Trans>Approve</Trans>
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={busy}
							onClick={() => action.mutate("unapprove")}
						>
							<Trans>Remove approval</Trans>
						</Button>
						<Button size="sm" disabled={busy} onClick={() => setMerge(true)}>
							{merging ? <Trans>Pending</Trans> : <Trans>Merge</Trans>}
						</Button>
						<Button
							size="sm"
							variant="ghost"
							disabled={busy}
							onClick={() => action.mutate("close")}
						>
							<Trans>Close</Trans>
						</Button>
					</>
				)}
				{pr.state === "closed" && (
					<Button
						size="sm"
						variant="outline"
						disabled={busy}
						onClick={() => action.mutate("reopen")}
					>
						<Trans>Reopen</Trans>
					</Button>
				)}
			</div>
			{merge && (
				<div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
					<select
						aria-label={t({ message: "Merge method" })}
						className="h-9 rounded-md border bg-background px-2 text-sm"
						value={method}
						onChange={(e) => setMethod(e.target.value as typeof method)}
					>
						{(!pr.mergeMethods || pr.mergeMethods.includes("merge_commit")) && (
							<option value="merge_commit">
								{t({ message: "Merge commit" })}
							</option>
						)}
						{(!pr.mergeMethods || pr.mergeMethods.includes("squash")) && (
							<option value="squash">{t({ message: "Squash" })}</option>
						)}
						{(!pr.mergeMethods || pr.mergeMethods.includes("fast_forward")) && (
							<option value="fast_forward">
								{t({ message: "Fast-forward" })}
							</option>
						)}
					</select>
					<Button
						size="sm"
						disabled={busy}
						onClick={() => action.mutate("merge")}
					>
						<Trans>Confirm merge</Trans>
					</Button>
					<Button size="sm" variant="ghost" onClick={() => setMerge(false)}>
						<Trans>Cancel</Trans>
					</Button>
				</div>
			)}
			<div className="flex gap-2 border-b pb-2">
				<Button
					variant={tab === "conversation" ? "secondary" : "ghost"}
					size="sm"
					onClick={() => setTab("conversation")}
				>
					<Trans>Conversation</Trans>
				</Button>
				<Button
					variant={tab === "code" ? "secondary" : "ghost"}
					size="sm"
					onClick={() => setTab("code")}
				>
					<Trans>Code</Trans>
				</Button>
				<Button
					variant={tab === "checks" ? "secondary" : "ghost"}
					size="sm"
					onClick={() => setTab("checks")}
				>
					<Trans>Checks</Trans>
				</Button>
			</div>
			{tab === "conversation" && (
				<div className="space-y-3">
					{comments.data?.pages
						.flatMap((p) => p.items)
						.map((c) => (
							<article key={c.id} className="rounded-lg border p-3">
								<p className="mb-2 text-xs font-medium">
									{c.author}
									{c.path ? ` · ${c.path}:${c.line ?? ""}` : ""}
								</p>
								<p className="whitespace-pre-wrap break-words text-sm">
									{c.body}
								</p>
							</article>
						))}
					{comments.hasNextPage && (
						<Button
							variant="ghost"
							size="sm"
							disabled={comments.isFetchingNextPage}
							onClick={() => void comments.fetchNextPage()}
						>
							<Trans>Load more</Trans>
						</Button>
					)}
					<Textarea
						aria-label={t({ message: "Comment" })}
						value={body}
						onChange={(e) => setBody(e.target.value)}
					/>
					<div className="flex gap-2">
						<Input
							aria-label={t({ message: "File path" })}
							placeholder={t({ message: "File path" })}
							value={inlinePath}
							onChange={(e) => setInlinePath(e.target.value)}
						/>
						<Input
							className="w-24"
							aria-label={t({ message: "Line" })}
							placeholder={t({ message: "Line" })}
							type="number"
							min="1"
							value={inlineLine}
							onChange={(e) => setInlineLine(e.target.value)}
						/>
					</div>
					<Button
						size="sm"
						disabled={!body.trim() || action.isPending}
						onClick={() => action.mutate("comment")}
					>
						<Trans>Add comment</Trans>
					</Button>
				</div>
			)}
			{tab === "code" && (
				<pre className="overflow-x-auto rounded-lg border bg-muted/20 p-4 font-mono text-xs">
					{diff.data ??
						(diff.isPending
							? t({ message: "Loading..." })
							: diff.error?.message)}
				</pre>
			)}
			{tab === "checks" && (
				<div className="space-y-2">
					{checks.data?.map((c) => (
						<a
							key={c.id}
							className="flex justify-between rounded-lg border p-3 text-sm"
							href={c.url}
							target="_blank"
							rel="noreferrer"
						>
							<span>{c.name}</span>
							<span>{c.state}</span>
						</a>
					))}
				</div>
			)}
			{(action.error || detail.error || comments.error || checks.error) && (
				<p role="alert" className="text-sm text-destructive">
					{action.error?.message ??
						detail.error?.message ??
						comments.error?.message ??
						checks.error?.message}
				</p>
			)}
		</div>
	);
}
