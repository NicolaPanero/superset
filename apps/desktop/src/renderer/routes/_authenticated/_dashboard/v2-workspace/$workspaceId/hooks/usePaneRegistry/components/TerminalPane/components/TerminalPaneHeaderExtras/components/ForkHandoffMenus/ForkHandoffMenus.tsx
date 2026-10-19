import type { RendererContext } from "@superset/panes";
import type {
	PaneViewerData,
	TerminalPaneData,
} from "../../../../../../../../types";
import type {
	CreateNewAgentSession,
	OpenAgentChat,
} from "../../../../../../../useAgentSessionLauncher/useAgentSessionLauncher";
import { TerminalNativeHandoffMenu } from "../TerminalNativeHandoffMenu";

export interface ForkHandoffMenusProps {
	ctx: RendererContext<PaneViewerData>;
	paneData: TerminalPaneData;
	openAgentChat: OpenAgentChat;
	createNewAgentSession: CreateNewAgentSession;
}

/** The fork's native handoff control for agent terminals. */
export function ForkHandoffMenus({
	workspaceId,
	terminalId,
	fork,
}: {
	workspaceId: string;
	terminalId: string;
	fork: ForkHandoffMenusProps;
}) {
	// Chats switch agent and account from the composer's model and account controls.
	if (fork.paneData.agentSurface === "acp") return null;
	return (
		<TerminalNativeHandoffMenu
			workspaceId={workspaceId}
			terminalId={terminalId}
			onCreateNewAgentSession={fork.createNewAgentSession}
		/>
	);
}
