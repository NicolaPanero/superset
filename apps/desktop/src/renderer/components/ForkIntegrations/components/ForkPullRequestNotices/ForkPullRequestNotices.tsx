import { Trans } from "@lingui/react/macro";
import type { ForkProviderId } from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import { Link } from "@tanstack/react-router";
import { LuCircleAlert, LuSettings2 } from "react-icons/lu";
import { ForkServiceNotice } from "../ForkServiceNotice";

export function ForkPullRequestNotices({
	warnings,
	onRetry,
}: {
	warnings: {
		repository: string;
		kind: string;
		provider?: ForkProviderId;
		unavailable?: boolean;
	}[];
	onRetry?: () => void;
}) {
	const repositories = [
		...new Set(
			warnings.filter((w) => w.kind === "connection").map((w) => w.repository),
		),
	].join(", ");
	const failedRepositories = [
		...new Set(
			warnings
				.filter((w) => w.kind === "request" && !w.unavailable)
				.map((w) => w.repository),
		),
	].join(", ");
	const unavailable = [
		...new Set(
			warnings.flatMap((w) =>
				w.unavailable && w.provider ? [w.provider] : [],
			),
		),
	];
	return (
		<>
			{unavailable.map((provider) => (
				<div key={provider} className="m-3">
					<ForkServiceNotice provider={provider} onRetry={onRetry} />
				</div>
			))}
			{failedRepositories && (
				<div
					aria-live="polite"
					className="m-3 flex items-center gap-3 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground"
				>
					<p className="flex-1">
						<Trans>
							Could not load pull requests for {failedRepositories}.
						</Trans>
					</p>
					{onRetry && (
						<Button size="sm" variant="outline" onClick={onRetry}>
							<Trans>Try again</Trans>
						</Button>
					)}
				</div>
			)}
			{repositories && (
				<div
					aria-live="polite"
					className="m-3 flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground"
				>
					<LuCircleAlert className="mt-0.5 size-3.5 shrink-0" />
					<div className="min-w-0 flex-1 space-y-2">
						<p className="break-words">
							<Trans>
								Check the connection for {repositories} in Fork Settings.
							</Trans>
						</p>
						<Link
							to="/settings/fork"
							className="inline-flex items-center gap-1.5 font-medium text-foreground hover:underline"
						>
							<LuSettings2 className="size-3" />
							<Trans>Connections</Trans>
						</Link>
					</div>
				</div>
			)}
			{warnings.some((w) => w.kind === "review-filter") && (
				<p
					aria-live="polite"
					className="px-4 py-2 text-xs text-muted-foreground"
				>
					<Trans>Review filters apply to GitHub repositories.</Trans>
				</p>
			)}
		</>
	);
}
