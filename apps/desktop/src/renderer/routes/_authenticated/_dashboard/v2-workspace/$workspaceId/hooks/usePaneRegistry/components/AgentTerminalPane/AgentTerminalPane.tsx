import { Trans, useLingui } from "@lingui/react/macro";
import type { RendererContext } from "@superset/panes";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { useEffect, useRef } from "react";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import type {
	ChatPaneData,
	OpenFile,
	PaneViewerData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useForkCliOptions } from "renderer/stores/fork-cli-options";
import { TerminalPane } from "../TerminalPane";
import type { AgentSurfaceSwitch } from "./hooks/useAgentSurfaceSwitch";
import { forkForcedChatCandidate } from "./hooks/useForcedAgentChat/forkForcedChatCandidate";
import { useForcedAgentChat } from "./hooks/useForcedAgentChat/useForcedAgentChat";

type ChatOnTerminalPaneData = TerminalPaneData &
	Omit<ChatPaneData, "sessionId"> & {
		agentSurface?: "cli" | "acp";
		acpSessionId?: string | null;
	};

/**
 * Chats used to be shown on the terminal pane. A layout saved then still holds
 * them there, so each one moves to its own chat pane the first time it renders.
 */
export function AgentTerminalPane({
	ctx,
	onOpenFile,
	onRevealPath,
	workspaceId,
	onSwitchSurface,
}: {
	ctx: RendererContext<PaneViewerData>;
	workspaceId: string;
	onSwitchSurface: AgentSurfaceSwitch["switchSurface"];
	onOpenFile: OpenFile;
	onRevealPath: (path: string) => void;
}) {
	const data = ctx.pane.data as ChatOnTerminalPaneData;
	const isSavedChat = data.agentSurface === "acp";
	const { t } = useLingui();
	const advanced = useForkCliOptions();
	const binding = useTerminalAgentBinding(workspaceId, data.terminalId);
	const currentCandidate = forkForcedChatCandidate({ advanced, data, binding });
	const capturedCandidate =
		useRef<ReturnType<typeof forkForcedChatCandidate>>(null);
	if (advanced || isSavedChat) capturedCandidate.current = null;
	else if (currentCandidate) capturedCandidate.current = currentCandidate;
	const candidate = capturedCandidate.current;
	const forced = useForcedAgentChat(
		candidate
			? `${workspaceId}:${ctx.pane.id}:${data.terminalId}:${candidate.agent.id}:${candidate.agent.sessionId}`
			: null,
		candidate?.waiting ?? false,
		async () => {
			if (!candidate) return false;
			await onSwitchSurface(ctx, "acp", candidate.agent);
			return (
				ctx.store.getState().tabs.find((tab) => tab.id === ctx.tab.id)?.panes[
					ctx.pane.id
				]?.kind === "chat-v3"
			);
		},
	);

	useEffect(() => {
		if (!isSavedChat) return;
		const {
			agentSurface: _surface,
			acpSessionId,
			createOnAttach: _create,
			...chat
		} = data;
		const state = ctx.store.getState();
		state.setPanePinned({ paneId: ctx.pane.id, pinned: false });
		state.replacePane({
			tabId: ctx.tab.id,
			paneId: ctx.pane.id,
			newPane: {
				kind: "chat-v3",
				pinned: ctx.pane.pinned,
				...(ctx.pane.titleOverride
					? { titleOverride: ctx.pane.titleOverride }
					: {}),
				data: { ...chat, sessionId: acpSessionId ?? null } as ChatPaneData,
			},
		});
	}, [
		isSavedChat,
		data,
		ctx.store,
		ctx.tab.id,
		ctx.pane.id,
		ctx.pane.titleOverride,
		ctx.pane.pinned,
	]);

	if (isSavedChat) return null;
	if (candidate && !candidate.waiting) {
		const what = t({ message: "Chat" });
		return (
			<div
				className="flex h-full flex-col items-center justify-center gap-3 p-6 text-sm text-muted-foreground"
				aria-live="polite"
			>
				{forced.state === "failed" ? (
					<>
						<p>
							<Trans>ACP chat is unavailable</Trans>
						</p>
						<Button size="sm" variant="outline" onClick={forced.retry}>
							<Trans>Retry</Trans>
						</Button>
					</>
				) : (
					<>
						<Spinner className="size-4" />
						<p>{t({ message: `Opening ${what}` })}</p>
					</>
				)}
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
			{candidate?.waiting && (
				<output className="shrink-0 border-b px-3 py-2 text-xs text-muted-foreground">
					<Trans>The chat will open when the current response finishes.</Trans>
				</output>
			)}
			<div className="min-h-0 flex-1">
				<TerminalPane
					ctx={ctx}
					onOpenFile={onOpenFile}
					onRevealPath={onRevealPath}
					workspaceId={workspaceId}
				/>
			</div>
		</div>
	);
}
