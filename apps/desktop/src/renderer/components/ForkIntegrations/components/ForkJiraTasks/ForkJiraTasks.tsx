import { Trans, useLingui } from "@lingui/react/macro";
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
import { forkJiraColumns } from "../../utils/forkJiraColumns";
import { required } from "../../utils/required";
import { ForkJiraAutomations } from "../ForkJiraAutomations";
import { ForkProviderIcon } from "../ForkProviderIcon";
import { ForkServiceNotice } from "../ForkServiceNotice";
import { ForkTaskDetail } from "../ForkTaskDetail/ForkTaskDetail";
import { ForkJiraBoard } from "./components/ForkJiraBoard";
import { ForkJiraTaskList } from "./components/ForkJiraTaskList";
import { ForkJiraTaskToolbar } from "./components/ForkJiraTaskToolbar";
import { type ForkJiraTaskFilters, forkJiraQuery } from "./fork-jira-query";
import { useForkJiraBoardContext } from "./hooks/useForkJiraBoardContext";

export function ForkJiraTasks() {
	const { t } = useLingui();
	const { formatNumber } = useFormat();
	const navigate = useNavigate();
	const { connections, client, hostUrl } = useForkConnections();
	const routeSearch = useSearch({ strict: false }) as ForkJiraTaskFilters;
	const remembered = useForkJiraFilters((state) => state.filters);
	const remember = useForkJiraFilters((state) => state.remember);
	const search: ForkJiraTaskFilters = {
		...remembered,
		...Object.fromEntries(
			Object.entries(routeSearch).filter(([, value]) => value !== undefined),
		),
	};
	const jira = connections.filter((c) => c.provider === "jira" && c.enabled);
	const connectionId =
		(jira.some((c) => c.id === search.forkConnection)
			? search.forkConnection
			: undefined) ??
		jira.find((c) => c.isDefault)?.id ??
		jira[0]?.id ??
		"";
	const connection = jira.find((c) => c.id === connectionId);
	const boardContext = useForkJiraBoardContext(
		connectionId,
		search.forkJiraBoard,
		search.forkJiraProject,
	);
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
		issueType: search.forkIssueType,
		parent: search.forkParent,
		boardFilter: boardContext.data?.board?.filterId ?? undefined,
	});
	const update = (patch: Partial<typeof search>) => {
		if (
			Object.hasOwn(patch, "forkJiraProject") ||
			Object.hasOwn(patch, "forkConnection")
		)
			patch = { ...patch, forkJiraBoard: undefined, forkSprint: undefined };
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
		enabled:
			!!client &&
			!!connection &&
			(!search.forkJiraBoard ||
				!boardContext.supported ||
				!!boardContext.data?.board),
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
	const close = () => void update({ forkTask: undefined });
	const columns = forkJiraColumns(items, boardContext.data?.board?.columns, {
		new: t({ message: "To do" }),
		indeterminate: t({ message: "In progress" }),
		done: t({ message: "Done" }),
		other: t({ message: "Other statuses" }),
	});
	const showSprint = new Set(items.map((task) => task.sprint ?? "")).size > 1;
	const unavailable = [query.error, detail.error].some(
		isForkServiceUnavailable,
	);
	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
			<ForkJiraTaskToolbar
				boardContext={boardContext}
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
				count={
					<>
						{formatNumber(items.length)}
						{query.hasNextPage && "+"}
					</>
				}
				automations={
					<ForkJiraAutomations
						connectionId={connectionId}
						jql={jql}
						initialFilters={{ ...search, search: text }}
					/>
				}
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
					<div
						className="min-h-0 flex-1 overflow-auto"
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
						) : search.forkJiraBoard && boardContext.isError ? (
							<div className="p-4 text-sm text-muted-foreground" role="alert">
								<Trans>Could not load Jira board settings.</Trans>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => void boardContext.refetch()}
								>
									<Trans>Try again</Trans>
								</Button>
							</div>
						) : query.isPending ? (
							board ? (
								<div className="flex gap-3 p-4">
									{["first", "second", "third"].map((id) => (
										<div
											key={id}
											className="w-72 min-w-72 max-w-md flex-1 space-y-2 rounded-xl bg-[color-mix(in_srgb,var(--muted)_35%,var(--background))] p-2"
										>
											<Skeleton className="m-1 h-4 w-24" />
											<Skeleton className="h-28 w-full rounded-lg" />
											<Skeleton className="h-28 w-full rounded-lg" />
										</div>
									))}
								</div>
							) : (
								<div>
									<Skeleton className="h-9 w-full rounded-none" />
									{["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => (
										<div
											key={id}
											className="flex h-10 items-center gap-3 border-b border-border/50 px-4"
										>
											<Skeleton className="size-4" />
											<Skeleton className="h-3 w-20" />
											<Skeleton className="h-3 flex-1" />
											<Skeleton className="h-5 w-16" />
											<Skeleton className="size-5 rounded-full" />
										</div>
									))}
								</div>
							)
						) : (
							<>
								{query.isError && !isForkServiceUnavailable(query.error) && (
									<div
										role="alert"
										className={cn(
											"rounded-xl border bg-muted/20 p-4 text-sm",
											"m-4",
										)}
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
													forkJiraBoard: undefined,
													forkJql: undefined,
													forkIssueType: undefined,
													forkParent: undefined,
													forkSprint: undefined,
												});
											}}
										>
											<Trans>All tasks</Trans>
										</Button>
									</div>
								)}
								{board ? (
									<ForkJiraBoard
										columns={columns}
										tasks={items}
										selected={search.forkTask}
										showSprint={showSprint}
										onSelect={(key) => void update({ forkTask: key })}
									/>
								) : (
									<ForkJiraTaskList
										columns={columns}
										tasks={items}
										selected={search.forkTask}
										showSprint={showSprint}
										onSelect={(key) => void update({ forkTask: key })}
									/>
								)}
								{query.hasNextPage && (
									<Button
										className="mx-auto my-4 flex"
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
								columns={columns}
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
