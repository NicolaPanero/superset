import type { RendererContext } from "@superset/panes";
import type {
	ChatPaneData,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";

export function syncChatSessionInfo(
	ctx: RendererContext<PaneViewerData>,
	info: { harnessSessionId?: string; title?: string },
	agentLabel?: string,
) {
	const state = ctx.store.getState();
	const current = state.getPane(ctx.pane.id);
	if (!current || current.pane.kind !== "chat-v3") return;
	const data = current.pane.data as ChatPaneData;
	const rebound =
		info.harnessSessionId !== undefined &&
		data.agent &&
		info.harnessSessionId !== data.agent.sessionId;
	const title = info.title?.trim() || data.chatTitle;
	if (rebound || title !== data.chatTitle) {
		state.setPaneData({
			paneId: current.pane.id,
			data: {
				...data,
				...(rebound && data.agent
					? { agent: { ...data.agent, sessionId: info.harnessSessionId } }
					: {}),
				...(title ? { chatTitle: title } : {}),
			},
		});
	}
	if (
		title &&
		current.pane.titleOverride &&
		(current.pane.titleOverride === data.agentLabel ||
			current.pane.titleOverride === agentLabel)
	) {
		state.setPaneTitleOverride({
			tabId: current.tabId,
			paneId: current.pane.id,
			titleOverride: undefined,
		});
	}
}
