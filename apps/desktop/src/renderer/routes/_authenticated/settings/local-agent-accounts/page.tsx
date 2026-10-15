import { Trans } from "@lingui/react/macro";
import { createFileRoute } from "@tanstack/react-router";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { z } from "zod";
import { LocalAgentAccountsView } from "./components/LocalAgentAccountsView";

export const Route = createFileRoute(
	"/_authenticated/settings/local-agent-accounts/",
)({
	validateSearch: z.object({
		workspaceId: z.string().optional(),
		accountKey: z.string().optional(),
		agent: z.string().optional(),
	}),
	component: LocalAgentAccountsPage,
});

function LocalAgentAccountsPage() {
	const { workspaceId, accountKey, agent } = Route.useSearch();
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
						Sign in, set up API keys and check quota for your local agents.
					</Trans>
				</p>
				<p className="text-xs text-muted-foreground">
					<Trans>Quota is shown when the provider supports it.</Trans>
				</p>
			</div>
			<LocalAgentAccountsView
				hostUrl={workspaceId ? workspaceHostUrl : activeHostUrl}
				focusedAccountKey={accountKey}
				focusedAgent={agent}
			/>
		</div>
	);
}
