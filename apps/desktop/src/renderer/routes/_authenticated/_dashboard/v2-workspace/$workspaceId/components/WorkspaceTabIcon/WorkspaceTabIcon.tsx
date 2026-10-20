import type { Tab } from "@superset/panes";
import { renderBrowserTabIcon } from "../../hooks/usePaneRegistry/components/BrowserPane";
import { TerminalPaneIcon } from "../../hooks/usePaneRegistry/components/TerminalPane/components/TerminalPaneIcon";
import type {
	ChatPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";

export function WorkspaceTabIcon({
	tab,
	workspaceId,
}: {
	tab: Tab<PaneViewerData>;
	workspaceId: string;
}) {
	const panes = Object.values(tab.panes);
	const pane =
		panes.length === 1
			? panes[0]
			: tab.activePaneId
				? tab.panes[tab.activePaneId]
				: undefined;
	if (pane?.kind === "chat-v3" || pane?.kind === "terminal") {
		const data = pane.data as ChatPaneData | TerminalPaneData;
		return (
			<TerminalPaneIcon
				agentId={data.agent?.id}
				workspaceId={workspaceId}
				terminalId={data.terminalId}
			/>
		);
	}
	return renderBrowserTabIcon(tab);
}
