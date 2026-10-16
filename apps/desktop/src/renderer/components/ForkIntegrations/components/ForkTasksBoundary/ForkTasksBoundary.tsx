import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { useForkProFeatures } from "renderer/stores/fork-cli-options";
import { useForkConnections } from "../../hooks/useForkConnections";
import { ForkJiraTasks } from "../ForkJiraTasks/ForkJiraTasks";

export function ForkTasksBoundary({ children }: { children: ReactNode }) {
	const { jiraConfigured, isPending } = useForkConnections(),
		showPro = useForkProFeatures(),
		navigate = useNavigate();
	const search = useSearch({ strict: false }) as { forkSource?: string };
	const { gateFeature } = usePaywall();
	const showJira = jiraConfigured && (search.forkSource === "jira" || !showPro);
	if (!showPro && isPending)
		return (
			<p className="p-6 text-muted-foreground">
				<Trans>Loading...</Trans>
			</p>
		);
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{jiraConfigured && (
				<div className="flex gap-2 border-b px-4 py-2">
					<Button
						size="sm"
						variant={showJira ? "secondary" : "ghost"}
						onClick={() =>
							void navigate({ to: "/tasks", search: { forkSource: "jira" } })
						}
					>
						Jira
					</Button>
					{showPro && (
						<Button
							size="sm"
							variant={!showJira ? "secondary" : "ghost"}
							onClick={() =>
								gateFeature(
									GATED_FEATURES.TASKS,
									() =>
										void navigate({
											to: "/tasks",
											search: { forkSource: "superset" },
										}),
								)
							}
						>
							<Trans>Tasks</Trans>
						</Button>
					)}
				</div>
			)}
			{showJira ? (
				<ForkJiraTasks />
			) : showPro ? (
				children
			) : (
				<div className="p-6">
					<Link to="/settings/fork" className="text-sm text-primary">
						<Trans>Configure integrations in Fork Settings.</Trans>
					</Link>
				</div>
			)}
		</div>
	);
}
