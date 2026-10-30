import { Trans } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import { useQuery } from "@tanstack/react-query";
import { Bot, Check, Loader2 } from "lucide-react";
import { useForkConnections } from "../../../../hooks/useForkConnections";
import { required } from "../../../../utils/required";
import { ForkAutomationRuns } from "../../../ForkAutomationRuns";
import { ForkTodayPanel } from "../ForkTodayPanel";
export function ForkTodayActivity() {
	const { client, hostUrl, data } = useForkConnections();
	const supported = (data?.version ?? 0) >= 9;
	const attempts = useQuery({
		queryKey: ["fork-integrations", hostUrl, "automation-attempts", undefined],
		queryFn: () => required(client).forkTasks.automationAttempts.query({}),
		enabled: !!client && supported,
		refetchInterval: 10_000,
		retry: false,
		networkMode: "always",
	});
	if (!supported) return null;
	const groups = [
		{
			title: <Trans>Agents waiting for you</Trans>,
			states: ["waiting_input"],
			tone: "bg-warning",
		},
		{
			title: <Trans>Runs to check</Trans>,
			states: ["failed", "unknown", "agent_done"],
			tone: "bg-primary",
		},
		{
			title: <Trans>In progress</Trans>,
			states: ["queued", "launching", "running", "verifying"],
			tone: "bg-success",
		},
	]
		.map((g) => ({
			...g,
			count: (attempts.data ?? []).filter((a) => g.states.includes(a.state))
				.length,
		}))
		.filter((g) => g.count > 0);
	return (
		<ForkTodayPanel icon={Bot} title={<Trans>Automations</Trans>}>
			<div className="space-y-5 p-4 @min-[640px]/today:p-5">
				{attempts.error ? (
					<p role="alert" className="break-words text-xs text-destructive">
						{attempts.error.message}
					</p>
				) : attempts.isPending ? (
					<p className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" aria-hidden />
						<Trans>Loading...</Trans>
					</p>
				) : groups.length === 0 ? (
					<p className="flex items-center gap-2 text-sm text-muted-foreground">
						<Check className="size-4 shrink-0 text-success" aria-hidden />
						<Trans>Nothing to check.</Trans>
					</p>
				) : (
					groups.map((group) => (
						<div key={group.states[0]} className="min-w-0 space-y-3">
							<h3 className="flex items-center gap-2 text-xs font-medium">
								<span
									className={`size-1.5 shrink-0 rounded-full ${group.tone}`}
									aria-hidden
								/>
								<span className="min-w-0 flex-1">{group.title}</span>
								<span className="tabular-nums text-muted-foreground">
									{formatNumber(group.count)}
								</span>
							</h3>
							<ForkAutomationRuns states={group.states} limit={20} wrapTitles />
						</div>
					))
				)}
			</div>
		</ForkTodayPanel>
	);
}
