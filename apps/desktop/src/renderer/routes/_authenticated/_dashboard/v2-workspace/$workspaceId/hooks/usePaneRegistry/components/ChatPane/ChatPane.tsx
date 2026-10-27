import type { UserContent } from "@superset/chat/protocol";
import type { RendererContext } from "@superset/panes";
import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import { useCallback, useRef } from "react";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { LinkHoverHint } from "renderer/lib/clickPolicy";
import type {
	ChatPaneData,
	OpenFile,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useLinkClickHint } from "../../hooks/useLinkClickHint";
import { AcpChatPane } from "./components/AcpChatPane";
import { useOpenChatLink } from "./hooks/useOpenChatLink";
import { useOpenChatPage } from "./hooks/useOpenChatPage";
import { openChatHistory } from "./utils/chatHistoryOpen";
import { saveChatMode } from "./utils/savedChatMode";
import { syncChatSessionInfo } from "./utils/syncChatSessionInfo";

export function ChatPane({
	ctx,
	onOpenFile,
	onRevealPath,
	workspaceId,
}: {
	ctx: RendererContext<PaneViewerData>;
	workspaceId: string;
	onOpenFile: OpenFile;
	onRevealPath: (path: string, options?: { isDirectory?: boolean }) => void;
}) {
	const data = ctx.pane.data as ChatPaneData;
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const { data: configs } = useV2AgentConfigs(hostUrl);
	const agentLabel =
		data.agentLabel ??
		configs?.find((config) => config.id === data.acpAgentConfigId)?.label ??
		AGENT_IDENTITY_LABELS[data.agent?.id as keyof typeof AGENT_IDENTITY_LABELS];
	const openPage = useOpenChatPage(ctx.store);
	const { hint, showHint } = useLinkClickHint();
	const openLink = useOpenChatLink({
		store: ctx.store,
		workspaceId,
		onOpenFile,
		onRevealPath,
		showHint,
	});
	const latest = useRef(data);
	latest.current = data;
	const paneId = ctx.pane.id;
	const onOpenHistory = useCallback(() => openChatHistory(paneId), [paneId]);
	const firstPrompt: UserContent[] =
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
			: [];
	const pendingPrompts = [
		...(firstPrompt.length > 0 ? [firstPrompt] : []),
		...(data.queuedPrompts ?? []),
	];

	return (
		<>
			<AcpChatPane
				key={`${data.terminalId}:${data.agent?.id}`}
				agent={data.agent}
				isActive={ctx.isActive}
				onPendingPromptsSent={() => {
					const {
						pendingPrompt: _sent,
						pendingAttachments: _attached,
						queuedPrompts: _queued,
						...rest
					} = latest.current;
					ctx.actions.updateData(rest);
				}}
				onQueuePrompt={(content) =>
					ctx.actions.updateData({
						...latest.current,
						queuedPrompts: [...(latest.current.queuedPrompts ?? []), content],
					})
				}
				pendingPrompts={pendingPrompts}
				agentConfigId={data.acpAgentConfigId}
				accountSelection={data.acpAccountSelection}
				modelId={data.chatModelId}
				modelLabel={data.chatModelLabel}
				modeId={data.chatModeId}
				onSessionInfo={({ harnessSessionId, title }) => {
					syncChatSessionInfo(ctx, { harnessSessionId, title }, agentLabel);
				}}
				onSwitchAgent={({ presetId, label, model, modeId, handoffPrompt }) => {
					if (ctx.pane.titleOverride === agentLabel) {
						ctx.store.getState().setPaneTitleOverride({
							tabId: ctx.tab.id,
							paneId: ctx.pane.id,
							titleOverride: undefined,
						});
					}
					ctx.actions.updateData({
						agentLabel: label,
						terminalId: data.terminalId,
						sessionId: null,
						agent: { id: presetId },
						...(model
							? { chatModelId: model.id, chatModelLabel: model.label }
							: {}),
						...(modeId ? { chatModeId: modeId } : {}),
						...(handoffPrompt ? { pendingPrompt: handoffPrompt } : {}),
					});
				}}
				onOpenAgentChat={({
					presetId,
					label,
					model,
					modeId,
					handoffPrompt,
					agentConfigId,
					accountSelection,
				}) =>
					ctx.store.getState().addTab({
						panes: [
							{
								kind: "chat-v3",
								data: {
									agentLabel: label,
									terminalId: crypto.randomUUID(),
									sessionId: null,
									agent: { id: presetId },
									...(model
										? { chatModelId: model.id, chatModelLabel: model.label }
										: {}),
									...(modeId ? { chatModeId: modeId } : {}),
									...(agentConfigId ? { acpAgentConfigId: agentConfigId } : {}),
									...(accountSelection !== undefined
										? { acpAccountSelection: accountSelection }
										: {}),
									...(handoffPrompt ? { pendingPrompt: handoffPrompt } : {}),
								} satisfies ChatPaneData,
							},
						],
					})
				}
				onOpenForkedChat={({ sessionId, terminalId }) => {
					const { agent, chatModelId, chatModelLabel, chatModeId, chatTitle } =
						latest.current;
					ctx.store.getState().addTab({
						panes: [
							{
								kind: "chat-v3",
								data: {
									terminalId,
									sessionId,
									...(agent ? { agent: { id: agent.id } } : {}),
									...(chatModelId ? { chatModelId } : {}),
									...(chatModelLabel ? { chatModelLabel } : {}),
									...(chatModeId ? { chatModeId } : {}),
									...(chatTitle ? { chatTitle } : {}),
								} satisfies ChatPaneData,
							},
						],
					});
				}}
				onRewound={(prompt) => {
					const { agent, chatModelId, chatModelLabel, chatModeId } =
						latest.current;
					ctx.actions.updateData({
						terminalId: latest.current.terminalId,
						sessionId: null,
						...(agent ? { agent: { id: agent.id } } : {}),
						...(chatModelId ? { chatModelId } : {}),
						...(chatModelLabel ? { chatModelLabel } : {}),
						...(chatModeId ? { chatModeId } : {}),
						pendingPrompt: prompt,
					});
				}}
				onModeChange={(chatModeId) => {
					if (data.agent) saveChatMode(data.agent.id, chatModeId);
					ctx.actions.updateData({ ...data, chatModeId });
				}}
				onSessionCreated={(sessionId, pendingPrompt) =>
					ctx.actions.updateData({
						...latest.current,
						sessionId,
						...(pendingPrompt ? { pendingPrompt } : {}),
					})
				}
				onOpenFile={onOpenFile}
				onOpenPage={openPage}
				onOpenLink={openLink}
				onOpenHistory={onOpenHistory}
				sessionId={data.sessionId}
				terminalId={data.terminalId}
				workspaceId={workspaceId}
			/>
			<LinkHoverHint hoverLabel={null} hoverPosition={null} clickHint={hint} />
		</>
	);
}
