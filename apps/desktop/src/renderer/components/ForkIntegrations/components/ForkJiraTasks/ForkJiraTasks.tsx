import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useForkConnections } from "../../hooks/useForkConnections";
import { required } from "../../utils/required";
import { ForkTaskDetail } from "../ForkTaskDetail/ForkTaskDetail";

export function ForkJiraTasks() {
	const { t } = useLingui(),
		navigate = useNavigate();
	const { connections, client, hostUrl } = useForkConnections();
	const search = useSearch({ strict: false }) as {
		forkTask?: string;
		forkConnection?: string;
	};
	const jira = connections.filter((c) => c.provider === "jira" && c.enabled);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const connectionId =
		search.forkConnection ??
		selectedId ??
		jira.find((c) => c.isDefault)?.id ??
		jira[0]?.id ??
		"";
	const [draft, setDraft] = useState(""),
		[jql, setJql] = useState(""),
		[board, setBoard] = useState(false);
	const query = useInfiniteQuery({
		queryKey: ["fork-integrations", hostUrl, "tasks", connectionId, jql],
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) =>
			required(client).forkTasks.list.query({
				connectionId,
				jql,
				cursor: pageParam,
			}),
		getNextPageParam: (page) => page.nextCursor ?? undefined,
		enabled: !!client && !!connectionId,
		retry: false,
	});
	const detail = useQuery({
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
		enabled: !!client && !!connectionId && !!search.forkTask,
		retry: false,
	});
	const selectTask = (key?: string) =>
		navigate({
			to: "/tasks",
			search: {
				forkSource: "jira",
				forkConnection: connectionId,
				forkTask: key,
			},
		});
	const items = query.data?.pages.flatMap((p) => p.items) ?? [];
	const groups = [
		...new Map(
			items.map((task) => [task.status.id, task.status.name]),
		).entries(),
	];
	if (search.forkTask)
		return (
			<div className="min-h-0 flex-1 overflow-auto">
				{detail.data ? (
					<ForkTaskDetail
						key={detail.data.connectionId + detail.data.id}
						task={detail.data}
						onBack={() => void selectTask()}
					/>
				) : (
					<div className="p-6">
						<Button variant="ghost" onClick={() => void selectTask()}>
							<Trans>Back</Trans>
						</Button>
						<p role="alert">
							{detail.error?.message ?? t({ message: "Loading..." })}
						</p>
					</div>
				)}
			</div>
		);
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<form
				className="flex flex-wrap items-center gap-2 border-b p-4"
				onSubmit={(e) => {
					e.preventDefault();
					setJql(draft);
				}}
			>
				<span className="mr-2 text-lg font-semibold">Jira</span>
				{jira.find((c) => c.id === connectionId)?.site && (
					<Button
						type="button"
						variant="outline"
						onClick={() =>
							window.open(
								required(jira.find((c) => c.id === connectionId)?.site) +
									"/secure/CreateIssue!default.jspa",
								"_blank",
								"noopener,noreferrer",
							)
						}
					>
						<Trans>Create task</Trans>
					</Button>
				)}
				<select
					aria-label={t({ message: "Account" })}
					className="h-9 max-w-64 rounded-md border bg-background px-2 text-sm"
					value={connectionId}
					onChange={(e) => {
						setSelectedId(e.target.value);
						void navigate({
							to: "/tasks",
							search: { forkSource: "jira", forkConnection: e.target.value },
						});
					}}
				>
					{jira.map((c) => (
						<option key={c.id} value={c.id}>
							{c.identity?.login ?? c.site ?? c.label}
						</option>
					))}
				</select>
				<Input
					className="min-w-48 flex-1"
					aria-label="JQL"
					placeholder="JQL"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
				/>
				<Button type="submit" variant="outline">
					<Trans>Search</Trans>
				</Button>
				<Button type="button" variant="ghost" onClick={() => setBoard(!board)}>
					{board ? <Trans>Table</Trans> : <Trans>Board</Trans>}
				</Button>
				<Button
					type="button"
					variant="ghost"
					onClick={() => void query.refetch()}
				>
					<Trans>Refresh</Trans>
				</Button>
			</form>
			<div className="min-h-0 flex-1 overflow-auto p-4">
				{query.isError && (
					<p role="alert" className="mb-4 text-sm text-destructive">
						{query.error.message}
					</p>
				)}
				{query.isPending && (
					<p className="text-sm text-muted-foreground">
						<Trans>Loading...</Trans>
					</p>
				)}
				{!query.isPending && !items.length && !query.isError && (
					<p className="p-6 text-center text-muted-foreground">
						<Trans>No tasks found</Trans>
					</p>
				)}
				{board ? (
					<div className="flex items-start gap-4">
						{groups.map(([id, name]) => (
							<section
								key={id}
								className="w-72 shrink-0 rounded-lg bg-muted/40 p-3"
							>
								<h3 className="mb-3 text-sm font-medium">{name}</h3>
								<div className="space-y-2">
									{items
										.filter((task) => task.status.id === id)
										.map((task) => (
											<button
												type="button"
												className="w-full rounded-lg border bg-background p-3 text-left shadow-sm hover:border-primary/40"
												key={task.id}
												onClick={() => void selectTask(task.key)}
											>
												<span className="text-xs text-muted-foreground">
													{task.key}
												</span>
												<p className="mt-1 text-sm">{task.title}</p>
											</button>
										))}
								</div>
							</section>
						))}
					</div>
				) : (
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b text-left text-xs text-muted-foreground">
								<th className="p-3">
									<Trans>Task</Trans>
								</th>
								<th className="p-3">
									<Trans>Status</Trans>
								</th>
								<th className="p-3">
									<Trans>Assignee</Trans>
								</th>
								<th className="p-3">
									<Trans>Priority</Trans>
								</th>
							</tr>
						</thead>
						<tbody>
							{items.map((task) => (
								<tr key={task.id} className="border-b hover:bg-muted/30">
									<td className="p-3">
										<button
											type="button"
											className="text-left"
											onClick={() => void selectTask(task.key)}
										>
											<span className="mr-3 text-xs text-muted-foreground">
												{task.key}
											</span>
											{task.title}
										</button>
									</td>
									<td className="p-3">{task.status.name}</td>
									<td className="p-3">{task.assignee?.name ?? "—"}</td>
									<td className="p-3">{task.priority ?? "—"}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
				{query.hasNextPage && (
					<Button
						className="mt-4"
						variant="outline"
						disabled={query.isFetchingNextPage}
						onClick={() => void query.fetchNextPage()}
					>
						<Trans>Load more</Trans>
					</Button>
				)}
			</div>
		</div>
	);
}
