import type { RendererContext } from "@superset/panes";
import type {
	ChatPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../../../../../types";

export function forkChatContext(
	ctx: RendererContext<PaneViewerData>,
): RendererContext<PaneViewerData> {
	if (ctx.pane.kind !== "chat-v3") return ctx;
	const data = ctx.pane.data as ChatPaneData;
	return {
		...ctx,
		pane: {
			...ctx.pane,
			data: { ...data, agentSurface: "acp", acpSessionId: data.sessionId },
		},
		actions: {
			...ctx.actions,
			updateData: (value) => {
				const {
					agentSurface: _surface,
					acpSessionId,
					...rest
				} = value as TerminalPaneData;
				ctx.actions.updateData({
					...rest,
					sessionId:
						"acpSessionId" in value || "terminalId" in value
							? (acpSessionId ?? null)
							: data.sessionId,
				} as ChatPaneData);
			},
		},
	};
}
