import { Trans } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Check, GitPullRequest, Loader2 } from "lucide-react";
import { useForkConnections } from "../../../../hooks/useForkConnections";
import { required } from "../../../../utils/required";
import { ForkTodayPanel } from "../ForkTodayPanel";
export function ForkTodayReviews() {
	const { client, hostUrl } = useForkConnections();
	const projects = useQuery({
		queryKey: ["fork-integrations", hostUrl, "automation-projects"],
		queryFn: () => required(client).project.list.query(),
		enabled: !!client,
		retry: false,
	});
	const projectIds = (projects.data ?? []).map((p) => p.id).slice(0, 50);
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
	const error = projects.error ?? reviews.error;
	const loading =
		!!client &&
		(projects.isPending || (projectIds.length > 0 && reviews.isPending));
	const items = reviews.data?.pullRequests ?? [];
	return (
		<ForkTodayPanel
			icon={GitPullRequest}
			title={<Trans>Reviews</Trans>}
			description={<Trans>Pull requests waiting for your review</Trans>}
			actions={
				items.length > 0 ? (
					<span className="rounded-md bg-muted px-2 py-1 text-xs tabular-nums">
						{formatNumber(items.length)}
					</span>
				) : undefined
			}
		>
			<div className="p-4 @min-[640px]/today:p-5">
				{error ? (
					<p role="alert" className="break-words text-xs text-destructive">
						{error.message}
					</p>
				) : loading ? (
					<p className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" aria-hidden />
						<Trans>Loading...</Trans>
					</p>
				) : items.length === 0 ? (
					<p className="flex items-center gap-2 text-sm text-muted-foreground">
						<Check className="size-4 shrink-0 text-success" aria-hidden />
						<Trans>No review requested.</Trans>
					</p>
				) : (
					<ul className="divide-y divide-border/60">
						{items.map((pr) => (
							<li key={`${pr.projectId}:${pr.prNumber}`}>
								<a
									href={pr.url}
									target="_blank"
									rel="noreferrer"
									className="group flex items-start gap-2 rounded-md py-3 text-sm outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
								>
									<span className="min-w-0 flex-1 space-y-1">
										<span className="block font-mono text-xs text-muted-foreground">
											#{formatNumber(pr.prNumber, { useGrouping: false })}
										</span>
										<span className="block break-words leading-relaxed [overflow-wrap:anywhere]">
											{pr.title}
										</span>
									</span>
									<ArrowUpRight
										className="mt-1 size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground"
										aria-hidden
									/>
								</a>
							</li>
						))}
					</ul>
				)}
			</div>
			<div className="border-t border-border/60 px-4 py-2">
				<Button
					asChild
					size="sm"
					variant="ghost"
					className="w-full justify-between"
				>
					<Link to="/pull-requests">
						<Trans>All pull requests</Trans>
						<ArrowUpRight className="size-3.5" aria-hidden />
					</Link>
				</Button>
			</div>
		</ForkTodayPanel>
	);
}
