import { Trans, useLingui } from "@lingui/react/macro";
import type { ForkPullRequest } from "@superset/shared/fork-integrations";
import { isForkServiceUnavailable } from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Textarea } from "@superset/ui/textarea";
import { cn } from "@superset/ui/utils";
import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { PullRequestMarkdown } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestMarkdown";
import { PullRequestPageBody } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestPageBody";
import { useForkConnections } from "../../hooks/useForkConnections";
import { required } from "../../utils/required";
import { ForkCommentComposer } from "../ForkCommentComposer";
import { ForkServiceNotice } from "../ForkServiceNotice";
import { ForkCommentThread } from "./components/ForkCommentThread";
import { ForkFixFindings } from "./components/ForkFixFindings";
import {
	type ForkPullRequestAction,
	ForkPullRequestActions,
} from "./components/ForkPullRequestActions";
import { ForkPullRequestChecks } from "./components/ForkPullRequestChecks";
import { ForkPullRequestDiff } from "./components/ForkPullRequestDiff";
import { ForkPullRequestHeader } from "./components/ForkPullRequestHeader";
import { ForkPullRequestReviewers } from "./components/ForkPullRequestReviewers";
import { forkReviewThreads } from "./utils/forkReviewThreads";

type PullRequestAction =
	| ForkPullRequestAction
	| "comment"
	| "reply"
	| "resolve"
	| "unresolve"
	| "edit";

type MergeMethod =
	| "merge_commit"
	| "squash"
	| "fast_forward"
	| "squash_fast_forward"
	| "rebase_fast_forward"
	| "rebase_merge";

type Tab = "conversation" | "code" | "checks";

export function ForkPullRequestDetail({
	pullRequest,
	hostUrl: targetHostUrl,
}: {
	pullRequest: ForkPullRequest;
	hostUrl?: string | null;
}) {
	const { t } = useLingui(),
		{ client, hostUrl } = useForkConnections(targetHostUrl),
		cache = useQueryClient();
	const target = {
		connectionId: pullRequest.connectionId,
		repository: pullRequest.repository,
		number: pullRequest.number,
	};
	const key = ["fork-integrations", hostUrl, "pr", target];
	const [merging, setMerging] = useState(false);
	const detail = useQuery({
		refetchOnReconnect: true,
		networkMode: "always",
		retry: false,
		queryKey: key,
		queryFn: () => required(client).forkScm.get.query(target),
		initialData: pullRequest,
		enabled: !!client,
		refetchOnMount: "always",
		refetchInterval: (q) =>
			merging && q.state.data?.state === "open" ? 3000 : false,
	});
	const pr = detail.data;
	const [tab, setTab] = useState<Tab>("conversation");
	const [edit, setEdit] = useState(false),
		[title, setTitle] = useState(pr.title),
		[description, setDescription] = useState(pr.description);
	const [method, setMethod] = useState<MergeMethod>(
		(pullRequest.defaultMergeMethod as MergeMethod | undefined) ??
			"merge_commit",
	);
	const comments = useInfiniteQuery({
		refetchOnReconnect: true,
		networkMode: "always",
		retry: false,
		initialPageParam: undefined as string | undefined,
		queryKey: [...key, "comments"],
		queryFn: ({ pageParam }) =>
			required(client).forkScm.comments.query({ ...target, cursor: pageParam }),
		getNextPageParam: (page) => page.nextCursor ?? undefined,
		enabled: !!client && tab !== "checks",
	});
	const diff = useQuery({
		refetchOnReconnect: true,
		networkMode: "always",
		retry: false,
		queryKey: [...key, "diff"],
		queryFn: () => required(client).forkScm.diff.query(target),
		enabled: !!client && tab === "code",
	});
	const checks = useQuery({
		refetchOnReconnect: true,
		networkMode: "always",
		retry: false,
		queryKey: [...key, "checks"],
		queryFn: () => required(client).forkScm.checks.query(target),
		enabled: !!client && tab === "checks",
	});
	const action = useMutation({
		networkMode: "always",
		retry: false,
		mutationFn: ({
			action,
			...extra
		}: {
			action: PullRequestAction;
			body?: string;
			commentId?: string;
			side?: "old" | "new";
			path?: string;
			line?: number;
		}) =>
			required(client).forkScm.action.mutate({
				...target,
				action,
				head: pr.headCommit,
				method: pr.repository.provider === "github" ? "merge" : method,
				...(action === "edit" ? { title, body: description } : {}),
				...extra,
			}),
		onSuccess: (_, { action: kind }) => {
			if (kind === "merge") setMerging(true);
			setEdit(false);
			void cache.invalidateQueries({ queryKey: ["fork-integrations"] });
			void cache.invalidateQueries({ queryKey: ["pullRequests"] });
		},
	});
	const allComments = comments.data?.pages.flatMap((page) => page.items) ?? [];
	const threads = forkReviewThreads(allComments);
	const bitbucket = pr.repository.provider === "bitbucket";
	const reply = (commentId: string, text: string) =>
		action.mutateAsync({ action: "reply", commentId, body: text });
	const resolve = (commentId: string, resolved: boolean) =>
		action.mutate({ action: resolved ? "resolve" : "unresolve", commentId });
	const errors = [
		action.error,
		detail.error,
		comments.error,
		checks.error,
		diff.error,
	];
	const unavailable = errors.some(isForkServiceUnavailable);
	const error = errors.find(
		(error) => error && !isForkServiceUnavailable(error),
	);
	const mergeMethods = (
		[
			["merge_commit", t({ message: "Merge commit" })],
			["squash", t({ message: "Squash" })],
			["fast_forward", t({ message: "Fast-forward" })],
			["squash_fast_forward", t({ message: "Squash, fast-forward only" })],
			["rebase_fast_forward", t({ message: "Rebase, fast-forward" })],
			["rebase_merge", t({ message: "Rebase, merge commit" })],
		] as const
	)
		.filter(([id]) => !pr.mergeMethods || pr.mergeMethods.includes(id))
		.map(([id, label]) => ({ id, label }));
	const pendingMerge = merging && pr.state === "open";
	const busy = action.isPending || pendingMerge;
	const tabs: { value: Tab; label: string }[] = [
		{ value: "conversation", label: t({ message: "Conversation" }) },
		{ value: "code", label: t({ message: "Changes" }) },
		{ value: "checks", label: t({ message: "Checks" }) },
	];
	const startEdit = () => {
		setTitle(pr.title);
		setDescription(pr.description);
		setEdit(true);
		setTab("conversation");
	};
	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			<div className="flex h-11 shrink-0 items-center gap-2 border-b px-4">
				<nav
					className="flex min-w-0 items-center gap-0.5"
					aria-label={t({ message: "Pull request detail tabs" })}
				>
					{tabs.map(({ value, label }) => (
						<button
							key={value}
							type="button"
							onClick={() => setTab(value)}
							aria-pressed={tab === value}
							className={cn(
								"inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
								tab === value
									? "bg-secondary text-foreground"
									: "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
							)}
						>
							{label}
							{value === "conversation" && threads.length > 0 && (
								<span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
									{threads.length}
								</span>
							)}
						</button>
					))}
				</nav>
				<div className="ml-auto" />
				<ForkPullRequestActions
					pr={pr}
					busy={busy}
					merging={pendingMerge}
					mergeMethods={mergeMethods}
					method={method}
					onMethodChange={(value) => setMethod(value as MergeMethod)}
					onAction={(kind) => action.mutate({ action: kind })}
					onEdit={startEdit}
				/>
			</div>
			{(unavailable || error) && (
				<div className="space-y-2 border-b px-4 py-3">
					{unavailable && (
						<ForkServiceNotice
							provider={pr.repository.provider}
							onRetry={() => {
								void detail.refetch();
								if (tab === "conversation") void comments.refetch();
								if (tab === "code") void diff.refetch();
								if (tab === "checks") void checks.refetch();
							}}
						/>
					)}
					{error && (
						<p role="alert" className="text-sm text-destructive">
							{error.message}
						</p>
					)}
				</div>
			)}
			{tab === "conversation" && (
				<PullRequestPageBody
					header={
						<ForkPullRequestHeader
							pr={pr}
							pendingLabel={pendingMerge ? t({ message: "Merging…" }) : null}
						/>
					}
					info={(variant) => (
						<div
							className={
								variant === "column" ? "flex flex-col gap-7" : "flex flex-col"
							}
						>
							<ForkPullRequestReviewers
								reviewers={pr.reviewers ?? []}
								variant={variant}
							/>
							{bitbucket && (
								<ForkFixFindings pr={pr} hostUrl={hostUrl} variant={variant} />
							)}
						</div>
					)}
				>
					{edit ? (
						<div className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4">
							<Input
								aria-label={t({ message: "Title" })}
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								className="font-medium"
							/>
							<Textarea
								aria-label={t({ message: "Description" })}
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								className="min-h-40"
							/>
							<div className="flex justify-end gap-2">
								<Button
									size="sm"
									variant="ghost"
									onClick={() => setEdit(false)}
								>
									<Trans>Cancel</Trans>
								</Button>
								<Button
									size="sm"
									disabled={busy || !title.trim()}
									onClick={() => action.mutate({ action: "edit" })}
								>
									<Trans>Save</Trans>
								</Button>
							</div>
						</div>
					) : (
						<PullRequestMarkdown body={pr.description} />
					)}
					<section className="mt-10 space-y-3">
						<h2 className="text-sm font-medium">
							<Trans>Activity</Trans>
						</h2>
						{comments.isPending && (
							<p className="text-xs text-muted-foreground">
								<Trans>Loading...</Trans>
							</p>
						)}
						{threads.map((thread) => (
							<ForkCommentThread
								key={thread.root.id}
								thread={thread}
								busy={busy}
								canReply={bitbucket}
								onReply={reply}
								onResolve={resolve}
							/>
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
						<ForkCommentComposer
							disabled={action.isPending}
							onSubmit={(body) =>
								action.mutateAsync({ action: "comment", body })
							}
						/>
					</section>
				</PullRequestPageBody>
			)}
			{tab === "code" && (
				<div className="min-h-0 flex-1 overflow-auto p-4">
					{diff.data !== undefined ? (
						<ForkPullRequestDiff
							diff={diff.data}
							threads={threads}
							busy={busy}
							canComment={bitbucket}
							onComment={(path, line, text, side) =>
								action.mutateAsync({
									action: "comment",
									body: text,
									path,
									line,
									side,
								})
							}
							onReply={reply}
							onResolve={resolve}
						/>
					) : (
						diff.isPending && (
							<p className="text-sm text-muted-foreground">
								<Trans>Loading...</Trans>
							</p>
						)
					)}
				</div>
			)}
			{tab === "checks" && (
				<div className="min-h-0 flex-1 overflow-auto">
					<div className="mx-auto w-full max-w-[76rem] px-6 py-4">
						<ForkPullRequestChecks
							checks={checks.data}
							loading={checks.isPending}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
