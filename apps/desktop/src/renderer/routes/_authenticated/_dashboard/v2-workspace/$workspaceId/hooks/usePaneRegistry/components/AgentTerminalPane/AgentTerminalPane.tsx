import type { RendererContext } from "@superset/panes";
import type {
	OpenFile,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type { TerminalPaneData } from "../../../../types";
import { useAgentSurface } from "../../../useAgentSurface";
import { AcpChatPane } from "../AcpChatPane";
import { TerminalPane } from "../TerminalPane";

/**
 * A terminal pane, shown on whichever surface its agent calls for. The choice
 * needs the agent binding, which is a hook, so it lives here rather than in the
 * pane registry's render callback.
 */
export function AgentTerminalPane({
	ctx,
	onOpenFile,
	onRevealPath,
	workspaceId,
}: {
	ctx: RendererContext<PaneViewerData>;
	workspaceId: string;
	onOpenFile: OpenFile;
	onRevealPath: (path: string) => void;
}) {
	const data = ctx.pane.data as TerminalPaneData;
	const { surface } = useAgentSurface(workspaceId, data);

	// Unmounted, not hidden: its pty is stopped on the chat surface, and a
	// mounted TerminalPane would auto-resume the agent straight back into it.
	if (surface === "acp") {
		return (
			<AcpChatPane
				agent={data.agent}
				onAgentSessionChanged={(sessionId) => {
					if (!data.agent) return;
					ctx.actions.updateData({
						...data,
						agent: { ...data.agent, sessionId },
					});
				}}
				onSessionCreated={(acpSessionId) =>
					ctx.actions.updateData({ ...data, acpSessionId })
				}
				sessionId={data.acpSessionId ?? null}
				workspaceId={workspaceId}
			/>
		);
	}

	return (
		<TerminalPane
			ctx={ctx}
			onOpenFile={onOpenFile}
			onRevealPath={onRevealPath}
			workspaceId={workspaceId}
		/>
	);
}
