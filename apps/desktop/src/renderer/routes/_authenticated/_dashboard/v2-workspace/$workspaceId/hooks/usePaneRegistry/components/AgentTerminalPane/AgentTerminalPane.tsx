import { Trans } from "@lingui/react/macro";
import type { RendererContext } from "@superset/panes";
import type {
	OpenFile,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type { TerminalPaneData } from "../../../../types";
import { TerminalPane } from "../TerminalPane";
import { AcpChatPane } from "./components/AcpChatPane";
import { AcpChatPending } from "./components/AcpChatPane/components/AcpChatPending";
import { useAgentSurface } from "./hooks/useAgentSurface";
import { saveChatMode } from "./utils/savedChatMode";

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
		if (!data.agent) {
			return (
				<AcpChatPending>
					<Trans>Opening the chat…</Trans>
				</AcpChatPending>
			);
		}
		return (
			<AcpChatPane
				key={`${data.terminalId}:${data.agent.id}`}
				agent={data.agent}
				isActive={ctx.isActive}
				onFirstPromptSent={() => {
					if (
						data.pendingPrompt === undefined &&
						data.pendingAttachments === undefined
					)
						return;
					const {
						pendingPrompt: _sent,
						pendingAttachments: _attached,
						...rest
					} = data;
					ctx.actions.updateData(rest);
				}}
				pendingFirstPrompt={
					data.pendingPrompt || data.pendingAttachments?.length
						? [
								...(data.pendingPrompt
									? [{ type: "text" as const, text: data.pendingPrompt }]
									: []),
								...(data.pendingAttachments ?? []).map((attachment) => ({
									type: "attachment" as const,
									...attachment,
								})),
							]
						: null
				}
				agentConfigId={data.acpAgentConfigId}
				accountSelection={data.acpAccountSelection}
				modelId={data.chatModelId}
				modelLabel={data.chatModelLabel}
				modeId={data.chatModeId}
				onSessionInfo={({ harnessSessionId, title }) => {
					const rebound = harnessSessionId !== undefined && data.agent;
					const retitled = title !== undefined && title !== data.chatTitle;
					if (!rebound && !retitled) return;
					ctx.actions.updateData({
						...data,
						...(rebound
							? { agent: { ...rebound, sessionId: harnessSessionId } }
							: {}),
						...(retitled ? { chatTitle: title } : {}),
					});
				}}
				onSwitchAgent={({ presetId, label, model, modeId, handoffPrompt }) => {
					ctx.actions.setTitle(label);
					const {
						acpSessionId: _session,
						chatModelId: _model,
						chatModelLabel: _modelLabel,
						chatModeId: _mode,
						pendingPrompt: _prompt,
						pendingAttachments: _attachments,
						...rest
					} = data;
					ctx.actions.updateData({
						...rest,
						agent: { id: presetId },
						...(model
							? { chatModelId: model.id, chatModelLabel: model.label }
							: {}),
						...(modeId ? { chatModeId: modeId } : {}),
						...(handoffPrompt ? { pendingPrompt: handoffPrompt } : {}),
					});
				}}
				onModeChange={(chatModeId) => {
					if (data.agent) saveChatMode(data.agent.id, chatModeId);
					ctx.actions.updateData({ ...data, chatModeId });
				}}
				onSessionCreated={(acpSessionId) =>
					ctx.actions.updateData({ ...data, acpSessionId })
				}
				onOpenFile={onOpenFile}
				sessionId={data.acpSessionId ?? null}
				terminalId={data.terminalId}
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
