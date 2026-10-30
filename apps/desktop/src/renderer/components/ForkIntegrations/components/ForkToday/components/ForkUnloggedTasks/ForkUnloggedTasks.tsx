import { Trans } from "@lingui/react/macro";
import type { ForkConnection } from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useForkConnections } from "../../../../hooks/useForkConnections";
import { required } from "../../../../utils/required";
import { forkUnloggedJql } from "./fork-unlogged-jql";

export function ForkUnloggedTasks({
	connection,
	days,
}: {
	connection: ForkConnection;
	days: 7 | 30 | 90;
}) {
	const { client, hostUrl } = useForkConnections();
	const navigate = useNavigate();
	const query = useInfiniteQuery({
		queryKey: [
			"fork-integrations",
			hostUrl,
			"tasks",
			"unlogged",
			connection.id,
			days,
		],
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) =>
			required(client).forkTasks.list.query({
				connectionId: connection.id,
				jql: forkUnloggedJql(days),
				cursor: pageParam,
			}),
		getNextPageParam: (page) => page.nextCursor ?? undefined,
		enabled: !!client,
		retry: false,
		staleTime: 60_000,
	});
	const tasks = [
		...new Map(
			(query.data?.pages.flatMap((page) => page.items) ?? []).map((task) => [
				task.key,
				task,
			]),
		).values(),
	];
	return (
		<div className="overflow-hidden rounded-xl border border-border/70">
			<div className="flex items-center justify-between border-b bg-muted/20 px-4 py-3">
				<h3 className="text-sm font-medium">{connection.label}</h3>
				<span className="text-xs tabular-nums text-muted-foreground">
					{tasks.length}
				</span>
			</div>
			{query.isPending && (
				<div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
					<Loader2 className="size-4 animate-spin" aria-hidden />
					<Trans>Loading...</Trans>
				</div>
			)}
			{query.error && (
				<div className="space-y-2 p-4">
					<p role="alert" className="text-xs text-destructive">
						{query.error.message}
					</p>
					<Button
						variant="outline"
						size="sm"
						onClick={() => void query.refetch()}
					>
						<Trans>Retry</Trans>
					</Button>
				</div>
			)}
			{!query.isPending && !query.error && !tasks.length && (
				<p className="p-5 text-sm text-muted-foreground">
					<Trans>No tasks without worklogs in this period.</Trans>
				</p>
			)}
			<ul className="divide-y divide-border/60">
				{tasks.map((task) => (
					<li key={task.key}>
						<button
							type="button"
							className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/25"
							onClick={() =>
								void navigate({
									to: "/tasks",
									search: {
										forkSource: "jira",
										forkConnection: connection.id,
										forkTask: task.key,
									},
								})
							}
						>
							<span className="shrink-0 font-mono text-xs text-muted-foreground">
								{task.key}
							</span>
							<span
								className="min-w-0 flex-1 truncate text-sm"
								title={task.title}
							>
								{task.title}
							</span>
							<span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
								{task.status.name}
							</span>
						</button>
					</li>
				))}
			</ul>
			{query.hasNextPage && (
				<div className="border-t p-3 text-center">
					<Button
						variant="ghost"
						size="sm"
						disabled={query.isFetchingNextPage}
						onClick={() => void query.fetchNextPage()}
					>
						<Trans>Load more</Trans>
					</Button>
				</div>
			)}
		</div>
	);
}
