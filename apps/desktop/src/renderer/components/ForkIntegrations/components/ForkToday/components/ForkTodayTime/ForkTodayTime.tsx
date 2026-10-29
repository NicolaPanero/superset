import { Trans } from "@lingui/react/macro";
import type { ForkConnection } from "@superset/shared/fork-integrations";
import { useQuery } from "@tanstack/react-query";
import { useForkConnections } from "../../../../hooks/useForkConnections";
import { required } from "../../../../utils/required";
import { formatForkDuration } from "../../../ForkTaskDetail/components/ForkTaskWorklog/utils/forkDuration";
import {
	forkLocalDay,
	forkSystemTimeZone,
} from "../../../ForkTaskDetail/components/ForkTaskWorklog/utils/forkLocalDay";
import { ForkTimesheetProposal } from "../ForkTimesheetProposal";

export function ForkTodayTime({ connection }: { connection: ForkConnection }) {
	const { client, hostUrl } = useForkConnections();
	const today = forkLocalDay();
	const timeZone = forkSystemTimeZone();
	const myTime = useQuery({
		queryKey: [
			"fork-integrations",
			hostUrl,
			"my-time",
			connection.id,
			today,
			timeZone,
		],
		queryFn: () =>
			required(client).forkTasks.myTime.query({
				connectionId: connection.id,
				date: today,
				timeZone,
			}),
		enabled: !!client,
		staleTime: 60_000,
		retry: false,
	});
	const settings = useQuery({
		queryKey: [
			"fork-integrations",
			hostUrl,
			"timesheet-settings",
			connection.id,
		],
		queryFn: () =>
			required(client).forkTasks.timesheetSettings.query({
				connectionId: connection.id,
			}),
		enabled: !!client,
		retry: false,
	});
	const total = formatForkDuration(myTime.data?.seconds ?? 0);
	return (
		<div className="space-y-3 rounded-xl border border-border/60 p-4">
			<div className="flex items-baseline gap-2">
				<h3 className="text-sm font-medium">{connection.label}</h3>
				<span className="text-xs text-muted-foreground">
					<Trans>Logged today: {total}</Trans>
				</span>
			</div>
			{myTime.error && (
				<p role="alert" className="text-xs text-destructive">
					{myTime.error.message}
				</p>
			)}
			{myTime.data && myTime.data.issues.length > 0 && (
				<ul className="space-y-1 text-sm">
					{myTime.data.issues.map((issue) => (
						<li key={issue.key} className="flex gap-3">
							<span className="w-16 shrink-0 tabular-nums">
								{formatForkDuration(issue.seconds)}
							</span>
							<span className="font-mono text-xs text-muted-foreground">
								{issue.key}
							</span>
							<span className="min-w-0 truncate">{issue.title}</span>
						</li>
					))}
				</ul>
			)}
			{settings.data?.enabled && (
				<div className="border-t pt-3">
					<ForkTimesheetProposal connectionId={connection.id} />
				</div>
			)}
		</div>
	);
}
