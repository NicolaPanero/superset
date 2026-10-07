import type { TerminalPaneData } from "../../../../../../../../types";
import type {
	CreateNewAgentSession,
	OpenAgentChat,
} from "../../../../../../../useAgentSessionLauncher/useAgentSessionLauncher";
import { AcpChatHandoffMenu } from "../AcpChatHandoffMenu";
import { TerminalNativeHandoffMenu } from "../TerminalNativeHandoffMenu";

export interface ForkHandoffMenusProps {
	paneData: TerminalPaneData;
	openAgentChat: OpenAgentChat;
	createNewAgentSession: CreateNewAgentSession;
}

/** The fork's native handoff control: chat panes and terminal panes. */
export function ForkHandoffMenus({
	workspaceId,
	terminalId,
	fork,
}: {
	workspaceId: string;
	terminalId: string;
	fork: ForkHandoffMenusProps;
}) {
	return fork.paneData.agentSurface === "acp" ? (
		<AcpChatHandoffMenu
			workspaceId={workspaceId}
			data={fork.paneData}
			onOpenAgentChat={fork.openAgentChat}
		/>
	) : (
		<TerminalNativeHandoffMenu
			workspaceId={workspaceId}
			terminalId={terminalId}
			onCreateNewAgentSession={fork.createNewAgentSession}
		/>
	);
}
