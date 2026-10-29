import { Trans, useLingui } from "@lingui/react/macro";
import { formatDateTime } from "@superset/i18n/format";
import type { ForkTask, ForkWorklog } from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { LuClock } from "react-icons/lu";
import { useForkConnections } from "../../../../hooks/useForkConnections";
import { required } from "../../../../utils/required";
import { formatForkDuration, parseForkDuration } from "./utils/forkDuration";
import {
	forkLocalDay,
	forkLocalQuarter,
	forkSystemTimeZone,
} from "./utils/forkLocalDay";

function parseJiraTime(value: string): number {
	return Date.parse(value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
}

export function ForkTaskWorklog({
	task,
	formOpen,
	onFormOpenChange,
}: {
	task: ForkTask;
	formOpen: boolean;
	onFormOpenChange: (open: boolean) => void;
}) {
	const { t } = useLingui();
	const { client, hostUrl, data } = useForkConnections();
	const cache = useQueryClient();
	const supported = (data?.version ?? 0) >= 8;
	const target = { connectionId: task.connectionId, key: task.key };
	const today = forkLocalDay();
	const [timeZone] = useState(forkSystemTimeZone);
	const [duration, setDuration] = useState("");
	const [date, setDate] = useState(today);
	const [time, setTime] = useState(forkLocalQuarter);
	const [comment, setComment] = useState("");
	const [clientOpId, setClientOpId] = useState(() => crypto.randomUUID());
	const seconds = parseForkDuration(duration);
	const worklogKey = ["fork-integrations", hostUrl, "worklogs", target];
	const myTimeKey = [
		"fork-integrations",
		hostUrl,
		"my-time",
		task.connectionId,
	];
	const capability = useQuery({
		queryKey: ["fork-integrations", hostUrl, "worklog-capability", target],
		queryFn: () => required(client).forkTasks.worklogCapability.query(target),
		enabled: !!client && supported && formOpen,
		staleTime: 300_000,
		retry: false,
	});
	const worklogs = useInfiniteQuery({
		queryKey: worklogKey,
		initialPageParam: 0,
		queryFn: ({ pageParam }) =>
			required(client).forkTasks.worklogs.query({
				...target,
				startAt: pageParam,
			}),
		getNextPageParam: (page) => page.nextStartAt ?? undefined,
		enabled: !!client && supported,
		retry: false,
	});
	const myTime = useQuery({
		queryKey: [...myTimeKey, today, timeZone],
		queryFn: () =>
			required(client).forkTasks.myTime.query({
				connectionId: task.connectionId,
				date: today,
				timeZone,
			}),
		enabled: !!client && supported,
		staleTime: 60_000,
		retry: false,
	});
	const log = useMutation({
		networkMode: "always",
		retry: false,
		mutationFn: () =>
			required(client).forkTasks.addWorklog.mutate({
				...target,
				clientOpId,
				date,
				time,
				timeZone,
				timeSpentSeconds: required(seconds),
				comment: comment.trim() || undefined,
			}),
		onSuccess: (result) => {
			toast.success(
				result.reused
					? t({ message: "This time was already logged in Jira" })
					: t({ message: "Time logged" }),
			);
			if (result.ambiguousTime)
				toast.info(
					t({
						message:
							"That time happens twice on this day because the clock moves back. Jira received the first one.",
					}),
				);
			setClientOpId(crypto.randomUUID());
			setDuration("");
			setComment("");
			onFormOpenChange(false);
			void cache.invalidateQueries({ queryKey: worklogKey });
			void cache.invalidateQueries({ queryKey: myTimeKey });
		},
	});
	if (!supported) return null;
	const items: ForkWorklog[] =
		worklogs.data?.pages.flatMap((page) => page.items) ?? [];
	const total = worklogs.data?.pages[0]?.total ?? 0;
	const mine = items
		.filter((entry) => entry.mine)
		.reduce((sum, entry) => sum + entry.timeSpentSeconds, 0);
	const blocked = capability.data && !capability.data.canLog;
	const account =
		data?.connections.find((c) => c.id === task.connectionId)?.identity?.name ??
		task.connectionId;
	const myDuration = formatForkDuration(mine);
	const todayDuration = formatForkDuration(myTime.data?.seconds ?? 0);
	const logDuration = formatForkDuration(seconds ?? 0);
	return (
		<section className="mt-8 space-y-3">
			<div className="flex items-center gap-2">
				<h2 className="text-sm font-medium">
					<Trans>Time</Trans>
				</h2>
				<span className="text-xs text-muted-foreground">
					{myTime.data && <Trans>My time today: {todayDuration}</Trans>}
				</span>
				<div className="ml-auto" />
				{!formOpen && (
					<Button
						size="xs"
						variant="outline"
						onClick={() => onFormOpenChange(true)}
					>
						<LuClock className="size-3.5" />
						<Trans>Log time</Trans>
					</Button>
				)}
			</div>
			{formOpen && blocked && (
				<div
					role="alert"
					className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm"
				>
					<span className="min-w-0 flex-1">
						{capability.data?.canLog === false &&
						capability.data.reason === "time-tracking-off" ? (
							<Trans>Time tracking is turned off on this Jira site.</Trans>
						) : (
							<Trans>Your Jira account cannot log time on this issue.</Trans>
						)}
					</span>
					<Button size="xs" variant="ghost" asChild>
						<a href={task.url} target="_blank" rel="noreferrer">
							<Trans>Open in Jira</Trans>
						</a>
					</Button>
					<Button
						size="xs"
						variant="ghost"
						onClick={() => onFormOpenChange(false)}
					>
						<Trans>Close</Trans>
					</Button>
				</div>
			)}
			{formOpen && !blocked && (
				<form
					className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (seconds) log.mutate();
					}}
				>
					<div className="grid gap-3 sm:grid-cols-3">
						<div className="space-y-1">
							<Label htmlFor="fork-worklog-duration">
								<Trans>Duration</Trans>
							</Label>
							<Input
								id="fork-worklog-duration"
								autoFocus
								placeholder="1h 30m"
								value={duration}
								onChange={(e) => setDuration(e.target.value)}
								aria-invalid={!!duration && !seconds}
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="fork-worklog-date">
								<Trans>Day</Trans>
							</Label>
							<Input
								id="fork-worklog-date"
								type="date"
								max={today}
								value={date}
								onChange={(e) => setDate(e.target.value)}
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="fork-worklog-time">
								<Trans>Start time</Trans>
							</Label>
							<Input
								id="fork-worklog-time"
								type="time"
								value={time}
								onChange={(e) => setTime(e.target.value)}
							/>
						</div>
					</div>
					{duration && !seconds && (
						<p className="text-xs text-destructive">
							<Trans>Write the duration as 45m, 1h 30m or 2h.</Trans>
						</p>
					)}
					<Textarea
						aria-label={t({ message: "Comment" })}
						placeholder={t({ message: "Comment (optional)" })}
						value={comment}
						onChange={(e) => setComment(e.target.value)}
						className="min-h-16"
					/>
					<p className="text-xs text-muted-foreground">
						<Trans>
							Logged as {account} · {timeZone}. The remaining estimate does not
							change.
						</Trans>
					</p>
					{log.isError && (
						<p role="alert" className="text-xs text-destructive">
							{log.error.message}
						</p>
					)}
					<div className="flex justify-end gap-2">
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={() => onFormOpenChange(false)}
						>
							<Trans>Cancel</Trans>
						</Button>
						<Button
							type="submit"
							size="sm"
							disabled={!seconds || !date || !time || log.isPending}
						>
							{seconds ? (
								<Trans>Log {logDuration}</Trans>
							) : (
								<Trans>Log time</Trans>
							)}
						</Button>
					</div>
				</form>
			)}
			{items.length > 0 && (
				<div className="space-y-1">
					<p className="text-xs text-muted-foreground">
						<Trans>
							{total} worklogs on this issue · mine among those shown:{" "}
							{myDuration}
						</Trans>
					</p>
					<ul className="divide-y rounded-xl border border-border/60">
						{items.map((entry) => (
							<li
								key={entry.id}
								className="flex min-w-0 items-baseline gap-3 px-3 py-2 text-sm"
							>
								<span className="w-16 shrink-0 font-medium tabular-nums">
									{formatForkDuration(entry.timeSpentSeconds)}
								</span>
								<span className="min-w-0 flex-1 truncate">
									{entry.author.name}
									{entry.comment && (
										<span className="text-muted-foreground">
											{" "}
											· {entry.comment}
										</span>
									)}
								</span>
								<span className="shrink-0 text-xs text-muted-foreground">
									{formatDateTime(parseJiraTime(entry.started))}
								</span>
							</li>
						))}
					</ul>
					{worklogs.hasNextPage && (
						<Button
							size="xs"
							variant="ghost"
							disabled={worklogs.isFetchingNextPage}
							onClick={() => void worklogs.fetchNextPage()}
						>
							<Trans>Load more</Trans>
						</Button>
					)}
				</div>
			)}
			{worklogs.isError && (
				<p role="alert" className="text-xs text-destructive">
					{worklogs.error.message}
				</p>
			)}
		</section>
	);
}
