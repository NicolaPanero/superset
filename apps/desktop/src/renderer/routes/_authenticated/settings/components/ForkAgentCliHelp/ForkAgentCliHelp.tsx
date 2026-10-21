import { Trans } from "@lingui/react/macro";
import { LuArrowUpRight, LuTerminal } from "react-icons/lu";
import { FORK_AGENT_CLI_GUIDES } from "./fork-agent-cli-guides";

export function ForkAgentCliHelp({
	agentId,
	agentLabel,
}: {
	agentId: string;
	agentLabel: string;
}) {
	if (!Object.hasOwn(FORK_AGENT_CLI_GUIDES, agentId)) return null;
	const guide = FORK_AGENT_CLI_GUIDES[agentId];
	return (
		<div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
			<LuTerminal
				className="mt-0.5 size-4 shrink-0 text-muted-foreground"
				aria-hidden="true"
			/>
			<div className="min-w-0 space-y-1.5 text-xs">
				<p className="text-muted-foreground">
					<Trans>
						If the CLI is not installed yet, install it on the computer where
						this agent will run before signing in.
					</Trans>
				</p>
				{guide && (
					<a
						href={guide}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 font-medium hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
					>
						<Trans>Install {agentLabel} CLI</Trans>
						<LuArrowUpRight className="size-3" aria-hidden="true" />
					</a>
				)}
			</div>
		</div>
	);
}
