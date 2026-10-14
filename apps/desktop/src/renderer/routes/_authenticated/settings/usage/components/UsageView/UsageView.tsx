import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Link } from "@tanstack/react-router";
import { LeaderboardCard } from "../LeaderboardCard";
import { UsageHistorySection } from "../UsageHistorySection";

export function UsageView({
	hostUrl,
	workspaceId,
}: {
	hostUrl: string | null;
	workspaceId?: string;
}) {
	return (
		<div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-4 px-6 py-4">
			<LeaderboardCard hostUrl={hostUrl} />
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
				<p className="text-sm text-muted-foreground">
					<Trans>
						Manage logins, API keys and quota in Local agent accounts.
					</Trans>
				</p>
				<Button variant="outline" size="sm" asChild>
					<Link to="/settings/local-agent-accounts" search={{ workspaceId }}>
						<Trans>Local agent accounts</Trans>
					</Link>
				</Button>
			</div>
			<UsageHistorySection hostUrl={hostUrl} />
		</div>
	);
}
