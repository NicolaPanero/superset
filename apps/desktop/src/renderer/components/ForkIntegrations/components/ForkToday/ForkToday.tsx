import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useForkConnections } from "../../hooks/useForkConnections";
import { required } from "../../utils/required";
import { ForkAutomationRuns } from "../ForkAutomationRuns";
import { ForkTodayTime } from "./components/ForkTodayTime";

function Section({
	title,
	children,
}: {
	title: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="space-y-2">
			<h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{title}
			</h2>
			{children}
		</section>
	);
}

export function ForkToday() {
	const { client, hostUrl, data, connections } = useForkConnections();
	const navigate = useNavigate();
	const version = data?.version ?? 0;
	const jira = connections.filter((c) => c.provider === "jira" && c.enabled);
	const projects = useQuery({
		queryKey: ["fork-integrations", hostUrl, "automation-projects"],
		queryFn: () => required(client).project.list.query(),
		enabled: !!client,
		retry: false,
	});
	const projectIds = (projects.data ?? [])
		.map((project) => project.id)
		.slice(0, 50);
	const reviews = useQuery({
		queryKey: ["fork-integrations", hostUrl, "today-reviews", projectIds],
		queryFn: () =>
			required(client).forkScm.searchPullRequests.query({
				projectId: projectIds[0] ?? "",
				projectIds,
				review: "review-requested",
				limit: 10,
				page: 1,
			}),
		enabled: !!client && projectIds.length > 0,
		staleTime: 120_000,
		retry: false,
	});
	return (
		<div className="h-full overflow-y-auto">
			<div className="mx-auto max-w-3xl space-y-8 p-6">
				<header>
					<h1 className="text-2xl font-semibold tracking-tight">
						<Trans>Today</Trans>
					</h1>
					<p className="text-sm text-muted-foreground">
						<Trans>What needs you now, all from this computer.</Trans>
					</p>
				</header>
				{version >= 9 && (
					<>
						<Section title={<Trans>Agents waiting for you</Trans>}>
							<ForkAutomationRuns
								states={["waiting_input"]}
								limit={20}
								emptyText={<Trans>No agent is waiting.</Trans>}
							/>
						</Section>
						<Section title={<Trans>Runs to check</Trans>}>
							<ForkAutomationRuns
								states={["failed", "unknown", "agent_done"]}
								limit={20}
								emptyText={<Trans>Nothing to check.</Trans>}
							/>
						</Section>
						<Section title={<Trans>In progress</Trans>}>
							<ForkAutomationRuns
								states={["queued", "launching", "running", "verifying"]}
								limit={20}
								emptyText={<Trans>No automation is running.</Trans>}
							/>
						</Section>
					</>
				)}
				<Section title={<Trans>Pull requests waiting for your review</Trans>}>
					{reviews.error && (
						<p role="alert" className="text-xs text-destructive">
							{reviews.error.message}
						</p>
					)}
					{reviews.data?.pullRequests.length === 0 && (
						<p className="text-xs text-muted-foreground">
							<Trans>No review requested.</Trans>
						</p>
					)}
					<ul className="space-y-1">
						{reviews.data?.pullRequests.map((pr) => (
							<li
								key={`${pr.projectId}:${pr.prNumber}`}
								className="flex gap-2 text-sm"
							>
								<span className="font-mono text-xs text-muted-foreground">
									#{pr.prNumber}
								</span>
								<a
									href={pr.url}
									target="_blank"
									rel="noreferrer"
									className="min-w-0 truncate hover:underline"
								>
									{pr.title}
								</a>
							</li>
						))}
					</ul>
					<Button
						size="xs"
						variant="ghost"
						onClick={() => void navigate({ to: "/pull-requests" })}
					>
						<Trans>All pull requests</Trans>
					</Button>
				</Section>
				{version >= 8 && jira.length > 0 && (
					<Section title={<Trans>Time</Trans>}>
						<div className="space-y-3">
							{jira.map((connection) => (
								<ForkTodayTime key={connection.id} connection={connection} />
							))}
						</div>
					</Section>
				)}
			</div>
		</div>
	);
}
