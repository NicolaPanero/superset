import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import type { CreatePaneInput, RendererContext } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useMemo } from "react";
import { useTerminalAppearance } from "renderer/hooks/useTerminalAppearance";
import { terminalQueryColors } from "renderer/lib/terminal/terminal-query-colors";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import type {
	ChatPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../../../../../types";
import { markChatSessionClosed } from "../../../../../../utils/closedChatSessions";
import { useChatWiring } from "../../../ChatSession/hooks/useSessionClient";

export type AgentSurface = "cli" | "acp";

export type AgentIdentity = {
	id: string;
	sessionId?: string;
	terminalId?: string;
};

export type AgentSurfaceSwitch = {
	/**
	 * Replaces an agent's terminal pane with its chat pane, or the reverse,
	 * stopping the process behind the one being left: two live processes on one
	 * session transcript would both be writing it.
	 */
	switchSurface(
		ctx: RendererContext<PaneViewerData>,
		surface: AgentSurface,
		agent: AgentIdentity | undefined,
	): Promise<void>;
	/** Resolves false when the adapter is still running. */
	stopChat(sessionId: string): Promise<boolean>;
};

export function useAgentSurfaceSwitch(workspaceId: string): AgentSurfaceSwitch {
	const { t } = useLingui();
	const wiring = useChatWiring();
	const prepareAcpLaunch = workspaceTrpc.agents.prepareAcpLaunch.useMutation();
	const prepareCursorSurface =
		workspaceTrpc.agents.prepareCursorSurface.useMutation();
	const killTerminal = workspaceTrpc.terminal.killSession.useMutation();
	const runAgent = workspaceTrpc.agents.run.useMutation();
	const appearance = useTerminalAppearance();

	const stopChat = useCallback(
		async (sessionId: string) => {
			const reopen = markChatSessionClosed(sessionId);
			try {
				await wiring.transport.closeSession({ sessionId });
				return true;
			} catch (error) {
				console.warn("[acp-chat] could not stop the chat session", error);
				reopen();
				return false;
			}
		},
		[wiring.transport],
	);

	const switchSurface = useCallback(
		async (
			ctx: RendererContext<PaneViewerData>,
			surface: AgentSurface,
			agent: AgentIdentity | undefined,
		) => {
			const replaceWith = (newPane: CreatePaneInput<PaneViewerData>) => {
				const state = ctx.store.getState();
				state.setPanePinned({ paneId: ctx.pane.id, pinned: false });
				state.replacePane({
					tabId: ctx.tab.id,
					paneId: ctx.pane.id,
					newPane: { ...newPane, pinned: ctx.pane.pinned },
				});
			};

			if (surface === "acp") {
				if (ctx.pane.kind !== "terminal" || !agent) return;
				const data = ctx.pane.data as TerminalPaneData;
				const { terminalId } = data;
				let launch: Awaited<ReturnType<typeof prepareAcpLaunch.mutateAsync>>;
				try {
					launch = await prepareAcpLaunch.mutateAsync({
						workspaceId,
						configId: data.acpAgentConfigId ?? agent.id,
						accountSelection: data.acpAccountSelection,
						sourceTerminalId: agent.terminalId,
					});
				} catch (error) {
					toast.error(t({ message: "ACP chat is unavailable" }), {
						description: errorMessage(error, t({ message: "Unknown error" })),
					});
					return;
				}
				if (
					data.cliTitle !== undefined &&
					ctx.pane.titleOverride === data.cliTitle
				) {
					ctx.store.getState().setPaneTitleOverride({
						tabId: ctx.tab.id,
						paneId: ctx.pane.id,
					});
				}
				terminalRuntimeRegistry.dispose(data.terminalId);
				try {
					await killTerminal.mutateAsync({
						terminalId: data.terminalId,
						workspaceId,
					});
					if (agent.id === "cursor-agent" && agent.sessionId)
						await prepareCursorSurface.mutateAsync({
							workspaceId,
							configId: launch.agentConfigId,
							sessionId: agent.sessionId,
							from: "cli",
						});
				} catch (error) {
					console.warn("[acp-chat] could not stop the terminal", error);

					toast.error(t({ message: "ACP chat is unavailable" }), {
						description: errorMessage(error, t({ message: "Unknown error" })),
					});
					return;
				}
				replaceWith({
					kind: "chat-v3",
					...(ctx.pane.titleOverride
						? { titleOverride: ctx.pane.titleOverride }
						: {}),
					data: {
						terminalId,
						sessionId: null,
						agent,
						acpAgentConfigId: launch.agentConfigId,
						acpAccountSelection: launch.accountSelection,
					} satisfies ChatPaneData,
				});
				return;
			}

			if (ctx.pane.kind !== "chat-v3") return;
			const data = ctx.pane.data as ChatPaneData;
			const resumeFrom = data.agent;
			if (!resumeFrom) return;

			let launch: Awaited<ReturnType<typeof prepareAcpLaunch.mutateAsync>>;
			try {
				launch = await prepareAcpLaunch.mutateAsync({
					workspaceId,
					configId: data.acpAgentConfigId ?? resumeFrom.id,
					accountSelection: data.acpAccountSelection,
					sourceTerminalId: data.terminalId,
				});
			} catch (error) {
				toast.error(t({ message: "Couldn't reopen the agent in a terminal" }), {
					description: errorMessage(error, t({ message: "Unknown error" })),
				});
				return;
			}
			if (data.sessionId && !(await stopChat(data.sessionId))) {
				toast.error(t({ message: "Couldn't stop the chat" }));
				return;
			}

			try {
				if (resumeFrom.id === "cursor-agent" && resumeFrom.sessionId)
					await prepareCursorSurface.mutateAsync({
						workspaceId,
						configId: launch.agentConfigId,
						sessionId: resumeFrom.sessionId,
						from: "acp",
					});
				const result = await runAgent.mutateAsync({
					workspaceId,
					colors: terminalQueryColors(appearance.theme),
					agent: launch.agentConfigId,
					accountSelection: launch.accountSelection,
					prompt: "",
					...(resumeFrom.sessionId
						? { resumeSessionId: resumeFrom.sessionId }
						: {}),
				});
				if (result.kind !== "terminal") {
					toast.error(
						t({ message: "Couldn't reopen the agent in a terminal" }),
					);
					return;
				}
				replaceWith({
					kind: "terminal",
					titleOverride: result.label,
					data: { terminalId: result.sessionId } satisfies TerminalPaneData,
				});
			} catch (error) {
				toast.error(t({ message: "Couldn't reopen the agent in a terminal" }), {
					description: errorMessage(error, t({ message: "Unknown error" })),
				});
			}
		},
		[
			prepareAcpLaunch,
			prepareCursorSurface,
			killTerminal,
			runAgent,
			stopChat,
			workspaceId,
			t,
			appearance.theme,
		],
	);

	return useMemo(
		() => ({ switchSurface, stopChat }),
		[switchSurface, stopChat],
	);
}
