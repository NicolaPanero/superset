import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import type { RendererContext } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useMemo } from "react";
import { useTerminalAppearance } from "renderer/hooks/useTerminalAppearance";
import { terminalQueryColors } from "renderer/lib/terminal/terminal-query-colors";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import type { PaneViewerData, TerminalPaneData } from "../../types";
import { useChatWiring } from "../usePaneRegistry/components/ChatV3Pane/hooks/useSessionClient";

export type AgentSurface = "cli" | "acp";

export type AgentIdentity = { id: string; sessionId: string };

export type AgentSurfaceSwitch = {
	/**
	 * Moves an agent terminal between its surfaces, stopping the process behind
	 * the one being left: two live processes on one session transcript would
	 * both be writing it. `agent` comes from the caller's own binding read.
	 */
	switchSurface(
		ctx: RendererContext<PaneViewerData>,
		surface: AgentSurface,
		agent: AgentIdentity | undefined,
	): Promise<void>;
	/** For a pane closing on the ACP surface, whose adapter nothing else stops. */
	stopChat(sessionId: string): Promise<void>;
};

export function useAgentSurfaceSwitch(workspaceId: string): AgentSurfaceSwitch {
	const { t } = useLingui();
	const wiring = useChatWiring();
	const killTerminal = workspaceTrpc.terminal.killSession.useMutation();
	const runAgent = workspaceTrpc.agents.run.useMutation();
	const appearance = useTerminalAppearance();

	const stopChat = useCallback(
		async (sessionId: string) => {
			try {
				await wiring.transport.closeSession({ sessionId });
			} catch (error) {
				console.warn("[acp-chat] could not stop the chat session", error);
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
			const data = ctx.pane.data as TerminalPaneData;
			if ((data.agentSurface ?? "cli") === surface) return;

			if (surface === "acp") {
				if (!agent) return;
				// Written before the kill: once the terminal is gone so is the
				// binding these ids come from.
				ctx.actions.updateData({ ...data, agentSurface: "acp", agent });
				terminalRuntimeRegistry.dispose(data.terminalId);
				try {
					await killTerminal.mutateAsync({
						terminalId: data.terminalId,
						workspaceId,
					});
				} catch (error) {
					// The chat is up and the agent session is what it reads, so a pty
					// that outlives the switch is untidy rather than broken.
					console.warn("[acp-chat] could not stop the terminal", error);
				}
				return;
			}

			const resumeFrom = data.agent;
			if (!resumeFrom) {
				ctx.actions.updateData({ ...data, agentSurface: "cli" });
				return;
			}

			// Before the launch, not after: the pty resumes the same agent session
			// the adapter still has open, and two processes on one session is what
			// this whole switch exists to avoid.
			if (data.acpSessionId) await stopChat(data.acpSessionId);

			try {
				const result = await runAgent.mutateAsync({
					workspaceId,
					colors: terminalQueryColors(appearance.theme),
					agent: resumeFrom.id,
					prompt: "",
					resumeSessionId: resumeFrom.sessionId,
				});
				if (result.kind !== "terminal") {
					toast.error(
						t({ message: "Couldn't reopen the agent in a terminal" }),
					);
					return;
				}
				// `updateData` replaces the pane's data rather than merging into it,
				// so the surface has to be written again here: dropped, it derives
				// back to the chat for a chat-capable agent and the terminal this
				// just launched is unmounted before it draws. `acpSessionId` is kept
				// so toggling back resumes that chat instead of starting a new one.
				ctx.actions.updateData({
					...data,
					agentSurface: "cli",
					terminalId: result.sessionId,
				});
				ctx.actions.setTitle(result.label);
			} catch (error) {
				toast.error(t({ message: "Couldn't reopen the agent in a terminal" }), {
					description: errorMessage(error, t({ message: "Unknown error" })),
				});
			}
		},
		[killTerminal, runAgent, stopChat, workspaceId, t, appearance.theme],
	);

	return useMemo(
		() => ({ switchSurface, stopChat }),
		[switchSurface, stopChat],
	);
}
