import { Trans } from "@lingui/react/macro";
import { createFileRoute } from "@tanstack/react-router";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { z } from "zod";
import { UsageView } from "../usage/components/UsageView";

export const Route = createFileRoute(
	"/_authenticated/settings/local-agent-accounts/",
)({
	validateSearch: z.object({ workspaceId: z.string().optional() }),
	component: LocalAgentAccountsPage,
});

function LocalAgentAccountsPage() {
	const { workspaceId } = Route.useSearch();
	const { activeHostUrl } = useLocalHostService();
	const workspaceHostUrl = useWorkspaceHostUrl(workspaceId ?? null);
	return (
		<div>
			<div className="mx-auto max-w-5xl space-y-2 px-6 pt-6">
				<h1 className="text-xl font-semibold">
					<Trans>Local agent accounts</Trans>
				</h1>
				<p className="text-sm text-muted-foreground">
					<Trans>
						Choose accounts manually. New agents use the default account unless
						their configuration or launch selects another.
					</Trans>
				</p>
			</div>
			<UsageView
				hostUrl={workspaceId ? workspaceHostUrl : activeHostUrl}
				accountsOnly
			/>
		</div>
	);
}
