import { Trans } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import type { ForkConnection } from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import { useInfiniteQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useForkConnections } from "../../../../hooks/useForkConnections";
import { required } from "../../../../utils/required";
import { ForkUnloggedTaskRow } from "./components/ForkUnloggedTaskRow";
import { forkUnloggedJql } from "./fork-unlogged-jql";

export function ForkUnloggedTasks({
	connection,
	days,
}: {
	connection: ForkConnection;
	days: 7 | 30 | 90;
}) {
	const { client, hostUrl } = useForkConnections();
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
		<div className="@container/task-list min-w-0">
			<div className="flex min-w-0 items-center justify-between gap-3 border-b border-border/50 px-4 py-3 @min-[700px]/task-list:px-5">
				<h3 className="min-w-0 break-words text-xs font-medium text-muted-foreground">
					{connection.label}
				</h3>
				<span className="text-xs tabular-nums text-muted-foreground">
					{formatNumber(tasks.length)}
					{query.hasNextPage ? "+" : ""}
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
				<p className="flex items-start gap-3 px-5 py-8 text-sm leading-relaxed text-muted-foreground">
					<CheckCircle2
						className="mt-0.5 size-5 shrink-0 text-success"
						aria-hidden
					/>
					<Trans>No tasks without worklogs in this period.</Trans>
				</p>
			)}
			<ul className="divide-y divide-border/60">
				{tasks.map((task) => (
					<ForkUnloggedTaskRow key={task.key} task={task} />
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
