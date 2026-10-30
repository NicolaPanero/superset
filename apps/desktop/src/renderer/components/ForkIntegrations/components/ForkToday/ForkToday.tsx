import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { Button } from "@superset/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	ArrowRight,
	ClipboardList,
	Loader2,
	RefreshCw,
	Sun,
} from "lucide-react";
import { useState } from "react";
import { useForkConnections } from "../../hooks/useForkConnections";
import { ForkTodayActivity } from "./components/ForkTodayActivity";
import { ForkTodayPanel } from "./components/ForkTodayPanel";
import { ForkTodayReviews } from "./components/ForkTodayReviews";
import { ForkUnloggedTasks } from "./components/ForkUnloggedTasks";
export function ForkToday() {
	const { t } = useLingui();
	const { formatDate, formatNumber } = useFormat();
	const { hostUrl, data, connections, isPending, error, refresh } =
		useForkConnections();
	const cache = useQueryClient();
	const [days, setDays] = useState<7 | 30 | 90>(30);
	const [refreshing, setRefreshing] = useState(false);
	const jira = connections.filter((c) => c.provider === "jira" && c.enabled);
	const reload = async () => {
		setRefreshing(true);
		try {
			await Promise.all([
				cache.invalidateQueries({
					queryKey: ["fork-integrations", hostUrl, "tasks", "unlogged"],
				}),
				cache.invalidateQueries({
					queryKey: ["fork-integrations", hostUrl, "automation-projects"],
				}),
				cache.invalidateQueries({
					queryKey: ["fork-integrations", hostUrl, "today-reviews"],
				}),
				cache.invalidateQueries({
					queryKey: ["fork-integrations", hostUrl, "automation-attempts"],
				}),
				refresh(),
			]);
		} finally {
			setRefreshing(false);
		}
	};
	return (
		<div
			className="@container/today h-full w-full min-w-0 flex-1 overflow-y-auto"
			data-today-scroll
		>
			<div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-5 @min-[720px]/today:px-7 @min-[720px]/today:py-7 @min-[1440px]/today:px-10">
				<header className="flex flex-wrap items-center justify-between gap-4">
					<div className="flex min-w-0 items-center gap-3">
						<span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/5 text-primary">
							<Sun className="size-5" aria-hidden />
						</span>
						<div className="min-w-0">
							<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
								<h1 className="text-2xl font-semibold tracking-tight">
									<Trans>Today</Trans>
								</h1>
								<span className="text-xs text-muted-foreground">
									{formatDate(new Date(), {
										weekday: "long",
										day: "numeric",
										month: "long",
									})}
								</span>
							</div>
							<p className="mt-1 text-sm text-muted-foreground">
								<Trans>Your tasks, reviews and agents in one place.</Trans>
							</p>
						</div>
					</div>
					<Button
						size="sm"
						variant="outline"
						disabled={refreshing}
						onClick={() => void reload()}
					>
						<RefreshCw
							className={refreshing ? "size-3.5 animate-spin" : "size-3.5"}
							aria-hidden
						/>
						<Trans>Refresh</Trans>
					</Button>
				</header>
				<div className="grid min-w-0 items-start gap-5 @min-[1120px]/today:grid-cols-[minmax(0,1fr)_340px] @min-[1440px]/today:grid-cols-[minmax(0,1fr)_380px]">
					<ForkTodayPanel
						icon={ClipboardList}
						title={<Trans>Tasks without worklogs</Trans>}
						description={
							<Trans>
								In-progress and completed tasks assigned to you, with no logged
								time.
							</Trans>
						}
						actions={
							<Button asChild size="sm" variant="ghost">
								<Link to="/tasks" search={{ forkSource: "jira" }}>
									<Trans>All tasks</Trans>
									<ArrowRight className="size-3.5" aria-hidden />
								</Link>
							</Button>
						}
					>
						<div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-card/95 px-4 py-3 backdrop-blur-sm @min-[640px]/today:px-5">
							<p className="text-xs leading-relaxed text-muted-foreground">
								<Trans>Updated in the last {days} days.</Trans>
							</p>
							<fieldset
								aria-label={t({ message: "Date range" })}
								className="flex shrink-0 gap-1 rounded-lg border border-border/70 bg-background p-1"
							>
								{([7, 30, 90] as const).map((value) => (
									<Button
										key={value}
										size="sm"
										variant={days === value ? "secondary" : "ghost"}
										className="min-w-12 px-3"
										aria-pressed={days === value}
										aria-label={formatNumber(value, {
											style: "unit",
											unit: "day",
											unitDisplay: "long",
										})}
										onClick={() => setDays(value)}
									>
										{formatNumber(value, {
											style: "unit",
											unit: "day",
											unitDisplay: "narrow",
										})}
									</Button>
								))}
							</fieldset>
						</div>
						{isPending ? (
							<div className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
								<Loader2 className="size-4 animate-spin" aria-hidden />
								<Trans>Loading...</Trans>
							</div>
						) : error ? (
							<p
								role="alert"
								className="break-words p-5 text-sm text-destructive"
							>
								{error.message}
							</p>
						) : (data?.version ?? 0) >= 8 && jira.length > 0 ? (
							<div className="divide-y divide-border/70">
								{jira.map((connection) => (
									<ForkUnloggedTasks
										key={connection.id}
										connection={connection}
										days={days}
									/>
								))}
							</div>
						) : (
							<div className="space-y-3 p-5">
								<p className="text-sm text-muted-foreground">
									<Trans>Connect Jira to see tasks without worklogs.</Trans>
								</p>
								<Button variant="outline" size="sm" asChild>
									<Link to="/settings/fork">
										<Trans>Fork Settings</Trans>
									</Link>
								</Button>
							</div>
						)}
						{jira.length > 0 && (
							<p className="border-t border-border/60 bg-muted/10 px-4 py-3 text-xs leading-relaxed text-muted-foreground @min-[640px]/today:px-5">
								<Trans>Open a task to log time manually.</Trans>
							</p>
						)}
					</ForkTodayPanel>
					<div className="grid min-w-0 items-start gap-5 @min-[760px]/today:grid-cols-2 @min-[1120px]/today:grid-cols-1">
						<ForkTodayReviews />
						<ForkTodayActivity />
					</div>
				</div>
			</div>
		</div>
	);
}
