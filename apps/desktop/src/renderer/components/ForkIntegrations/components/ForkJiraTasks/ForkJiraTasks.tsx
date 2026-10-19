import { Trans } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { isForkServiceUnavailable } from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import { Skeleton } from "@superset/ui/skeleton";
import { cn } from "@superset/ui/utils";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LuCheckCheck, LuX } from "react-icons/lu";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { useForkJiraFilters } from "renderer/stores/fork-jira-filters";
import { useForkConnections } from "../../hooks/useForkConnections";
import { required } from "../../utils/required";
import { ForkProviderIcon } from "../ForkProviderIcon";
import { ForkServiceNotice } from "../ForkServiceNotice";
import { ForkTaskDetail } from "../ForkTaskDetail/ForkTaskDetail";
import { ForkJiraTaskCard } from "./components/ForkJiraTaskCard";
import { ForkJiraTaskToolbar } from "./components/ForkJiraTaskToolbar";
import {
	type ForkJiraTaskFilters,
	forkJiraQuery,
	jiraStatusTone,
} from "./fork-jira-query";

export function ForkJiraTasks() {
	const { formatNumber } = useFormat();
	const navigate = useNavigate();
	const { connections, client, hostUrl } = useForkConnections();
	const routeSearch = useSearch({ strict: false }) as ForkJiraTaskFilters;
	const remembered = useForkJiraFilters((state) => state.filters);
	const remember = useForkJiraFilters((state) => state.remember);
	const search: ForkJiraTaskFilters = { ...remembered, ...routeSearch };
	const jira = connections.filter((c) => c.provider === "jira" && c.enabled);
	const connectionId =
		(jira.some((c) => c.id === search.forkConnection)
			? search.forkConnection
			: undefined) ??
		jira.find((c) => c.isDefault)?.id ??
		jira[0]?.id ??
		"";
	const connection = jira.find((c) => c.id === connectionId);
	const scope = search.forkScope ?? "mine";
	const status = search.forkStatus ?? "open";
	const board = search.forkView === "board";
	const [text, setText] = useState(search.search ?? "");
	useEffect(() => setText(search.search ?? ""), [search.search]);
	const debouncedText = useDebouncedValue(text, 300);
	const projects = useQuery({
		refetchOnReconnect: true,
		networkMode: "always",
		retry: false,
		queryKey: ["fork-integrations", hostUrl, "jira-projects", connectionId],
		queryFn: () => required(client).forkTasks.projects.query({ connectionId }),
		enabled: !!client && !!connection,
		staleTime: 60_000,
	});
	const jql = forkJiraQuery({
		search: debouncedText,
		scope,
		status,
		project: search.forkJiraProject ?? "",
		jql: search.forkJql ?? "",
		projectKeys: projects.data?.map((p) => p.key),
		sprint: search.forkSprint,
	});
	const update = (patch: Partial<typeof search>) => {
		remember(patch);
		return navigate({
			to: "/tasks",
			search: {
				...search,
				search: text || undefined,
				forkSource: "jira",
				forkConnection: connectionId,
				...patch,
			},
			replace: !Object.hasOwn(patch, "forkTask"),
		});
	};
	const query = useInfiniteQuery({
		refetchOnReconnect: true,
		networkMode: "always",
		retry: false,
		queryKey: ["fork-integrations", hostUrl, "tasks", connectionId, jql],
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) =>
			required(client).forkTasks.list.query({
				connectionId,
				jql,
				cursor: pageParam,
			}),
		getNextPageParam: (page) => page.nextCursor ?? undefined,
		enabled: !!client && !!connection,
		staleTime: 30_000,
	});
	const detail = useQuery({
		refetchOnReconnect: true,
		networkMode: "always",
		retry: false,
		queryKey: [
			"fork-integrations",
			hostUrl,
			"task",
			connectionId,
			search.forkTask,
		],
		queryFn: () =>
			required(client).forkTasks.get.query({
				connectionId,
				key: required(search.forkTask),
			}),
		enabled: !!client && !!connection && !!search.forkTask,
	});
	const items = [
		...new Map(
			(query.data?.pages.flatMap((p) => p.items) ?? []).map((task) => [
				task.id,
				task,
			]),
		).values(),
	];
	const categories = ["new", "indeterminate", "done"];
	const groups = [
		...new Map(items.map((task) => [task.status.id, task.status])).values(),
	].sort(
		(a, b) => categories.indexOf(a.category) - categories.indexOf(b.category),
	);
	const close = () => void update({ forkTask: undefined });
	const unavailable = [query.error, detail.error].some(
		isForkServiceUnavailable,
	);
	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
			<ForkJiraTaskToolbar
				search={search}
				jira={jira}
				projects={projects.data ?? []}
				connectionId={connectionId}
				text={text}
				setText={setText}
				update={update}
				isFetching={query.isFetching}
				onRefresh={() => {
					void query.refetch();
					if (search.forkTask) void detail.refetch();
				}}
			/>
			{unavailable && (
				<div className="border-b p-3">
					<ForkServiceNotice
						provider="jira"
						onRetry={() => {
							void query.refetch();
							if (search.forkTask) void detail.refetch();
						}}
					/>
				</div>
			)}
			<div className="@container/jira flex min-h-0 min-w-0 flex-1 overflow-hidden">
				<div
					className={cn(
						"flex min-h-0 min-w-0 flex-1 flex-col",
						search.forkTask && "hidden @3xl/jira:flex",
					)}
				>
					<div className="flex items-center gap-2 border-b bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
						<ForkProviderIcon provider="jira" className="size-3" />
						<span aria-live="polite">
							{formatNumber(items.length)}
							{query.hasNextPage && "+"} · <Trans>Tasks</Trans>
						</span>
						{search.forkJql && (
							<span className="ml-auto rounded bg-muted px-1.5 font-mono">
								JQL
							</span>
						)}
					</div>
					<div
						className="min-h-0 flex-1 overflow-auto p-3"
						aria-busy={query.isFetching}
					>
						{!connection ? (
							<div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
								<ForkProviderIcon provider="jira" className="size-8" />
								<Trans>Connect an account in Fork Settings</Trans>
								<Button
									size="sm"
									variant="outline"
									onClick={() => void navigate({ to: "/settings/fork" })}
								>
									<Trans>Connections</Trans>
								</Button>
							</div>
						) : query.isPending ? (
							<div className="space-y-2">
								{["first", "second", "third", "fourth", "fifth", "sixth"].map(
									(id) => (
										<Skeleton key={id} className="h-24 w-full rounded-xl" />
									),
								)}
							</div>
						) : (
							<>
								{query.isError && !isForkServiceUnavailable(query.error) && (
									<div
										role="alert"
										className="mb-4 rounded-xl border bg-muted/20 p-4 text-sm"
									>
										<p className="font-medium">
											<Trans>Could not load tasks.</Trans>
										</p>
										<p className="mt-1 break-words text-xs text-muted-foreground">
											{query.error.message}
										</p>
										<div className="mt-3 flex gap-2">
											<Button
												size="sm"
												variant="outline"
												onClick={() => void query.refetch()}
											>
												<Trans>Try again</Trans>
											</Button>
											<Button
												size="sm"
												variant="ghost"
												onClick={() => void navigate({ to: "/settings/fork" })}
											>
												<Trans>Connections</Trans>
											</Button>
										</div>
									</div>
								)}
								{!items.length && !query.isError && (
									<div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
										<div className="rounded-2xl border bg-muted/30 p-4">
											<LuCheckCheck className="size-7 opacity-60" />
										</div>
										<p className="text-sm font-medium text-foreground">
											<Trans>No tasks found</Trans>
										</p>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => {
												setText("");
												void update({
													search: undefined,
													forkScope: "all",
													forkStatus: "all",
													forkJiraProject: undefined,
													forkJql: undefined,
												});
											}}
										>
											<Trans>All tasks</Trans>
										</Button>
									</div>
								)}
								{board ? (
									<div className="flex min-h-full items-start gap-3">
										{groups.map((group) => {
											const tasks = items.filter(
												(task) => task.status.id === group.id,
											);
											return (
												<section
													key={group.id}
													className="w-72 shrink-0 rounded-xl border border-border/60 bg-muted/25 p-2.5"
												>
													<div className="mb-3 flex items-center gap-2 px-1 py-1">
														<span
															className={cn(
																"size-2 rounded-full",
																jiraStatusTone(group.category).split(" ")[0],
																"bg-current",
															)}
														/>
														<h2 className="text-xs font-medium">
															{group.name}
														</h2>
														<span className="ml-auto rounded-md bg-background px-1.5 text-[10px] tabular-nums text-muted-foreground">
															{formatNumber(tasks.length)}
														</span>
													</div>
													<div className="space-y-2">
														{tasks.map((task) => (
															<ForkJiraTaskCard
																key={task.id}
																task={task}
																selected={search.forkTask === task.key}
																board
																onClick={() =>
																	void update({ forkTask: task.key })
																}
															/>
														))}
													</div>
												</section>
											);
										})}
									</div>
								) : (
									<div className="space-y-1">
										{items.map((task) => (
											<ForkJiraTaskCard
												key={task.id}
												task={task}
												selected={search.forkTask === task.key}
												onClick={() => void update({ forkTask: task.key })}
											/>
										))}
									</div>
								)}
								{query.hasNextPage && (
									<Button
										className="mx-auto mt-4 flex"
										variant="outline"
										size="sm"
										disabled={query.isFetchingNextPage}
										onClick={() => void query.fetchNextPage()}
									>
										<Trans>Load more</Trans>
									</Button>
								)}
							</>
						)}
					</div>
				</div>
				{search.forkTask && (
					<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto border-l @3xl/jira:max-w-[55%]">
						{detail.data ? (
							<ForkTaskDetail
								key={detail.data.connectionId + detail.data.id}
								task={detail.data}
								onBack={close}
							/>
						) : (
							<div className="space-y-4 p-6">
								<Button size="sm" variant="ghost" onClick={close}>
									<LuX className="size-3.5" />
									<Trans>Close</Trans>
								</Button>
								{detail.isError ? (
									<div role="alert" className="space-y-3">
										{!isForkServiceUnavailable(detail.error) && (
											<p className="text-sm text-muted-foreground">
												{detail.error.message}
											</p>
										)}
										<Button
											size="sm"
											variant="outline"
											onClick={() => void detail.refetch()}
										>
											<Trans>Try again</Trans>
										</Button>
									</div>
								) : (
									<>
										<Skeleton className="h-7 w-1/2" />
										<Skeleton className="h-32 w-full" />
									</>
								)}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
