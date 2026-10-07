import { Trans } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { workspaceTrpc } from "@superset/workspace-client";
import { lineageChain } from "./utils/lineageChain";

/** Compact provenance of a chat that was handed over between agents. */
export function ChatLineageLabel({
	workspaceId,
	agent,
}: {
	workspaceId: string;
	agent: { id: string; sessionId?: string } | undefined;
}) {
	const { data } = workspaceTrpc.sessionTransfer.lineage.useQuery(
		{ workspaceId, limit: 100 },
		{ enabled: Boolean(agent?.sessionId), staleTime: 15_000 },
	);
	if (!agent?.sessionId || !data) return null;
	const { from, continuedIn } = lineageChain(
		data.items,
		agent.id,
		agent.sessionId,
	);
	if (from.length === 0 && !continuedIn) return null;
	const chain = from.join(" → ");
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="hidden max-w-48 truncate text-[10px] text-muted-foreground @min-[320px]/pane-header:inline">
					{continuedIn ? (
						<Trans>→ continued in {continuedIn}</Trans>
					) : (
						<Trans>→ from {chain}</Trans>
					)}
				</span>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				{from.length > 0 && <Trans>Continued from {chain}</Trans>}
				{from.length > 0 && continuedIn && <br />}
				{continuedIn && <Trans>Continued in {continuedIn}</Trans>}
			</TooltipContent>
		</Tooltip>
	);
}
