import { Trans } from "@lingui/react/macro";
import { Spinner } from "@superset/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { acpHarnessForAgent } from "../../../../utils/acpHarness";
import { SessionView } from "../ChatV3Pane/components/SessionView";
import { useSessionClient } from "../ChatV3Pane/hooks/useSessionClient";
import { AcpRecovery } from "./components/AcpRecovery";

/**
 * The ACP surface of an agent terminal: a chat bridged to the agent session the
 * terminal was running, resumed by its session id. The pty is stopped while
 * this shows, so `agent` comes from the pane rather than the live binding.
 */
export function AcpChatPane({
	agent,
	onAgentSessionChanged,
	onSessionCreated,
	sessionId,
	workspaceId,
}: {
	workspaceId: string;
	agent: { id: string; sessionId: string } | undefined;
	sessionId: string | null;
	onSessionCreated: (sessionId: string) => void;
	onAgentSessionChanged: (harnessSessionId: string) => void;
}) {
	const { client, wiring } = useSessionClient(sessionId);
	const harness = acpHarnessForAgent(agent?.id);
	const [failure, setFailure] = useState<string | null>(null);

	// The stored session outlives its process — after a host restart the row
	// still reads "idle" and only the send fails. Ask who is actually running.
	const { data: stored } = useQuery({
		enabled: sessionId !== null,
		queryKey: ["acp-chat-session", sessionId],
		queryFn: () =>
			sessionId
				? wiring.transport.getSession({ sessionId })
				: Promise.resolve(null),
		staleTime: 5_000,
	});

	const attaching = useRef(false);
	const start = useCallback(
		async (resumeHarness: string, resume?: string) => {
			attaching.current = true;
			setFailure(null);
			try {
				const created = await wiring.transport.createSession({
					commandId: crypto.randomUUID(),
					workspaceId,
					harness: resumeHarness,
					...(resume ? { resume: { harnessSessionId: resume } } : {}),
				});
				onSessionCreated(created.sessionId);
			} catch (error) {
				attaching.current = false;
				setFailure(error instanceof Error ? error.message : String(error));
			}
		},
		[wiring.transport, workspaceId, onSessionCreated],
	);

	const agentSessionId = agent?.sessionId;
	useEffect(() => {
		if (sessionId || attaching.current || !harness || !agentSessionId) return;
		void start(harness, agentSessionId);
	}, [sessionId, harness, agentSessionId, start]);

	const startFresh = useCallback(() => {
		if (!harness) return;
		attaching.current = false;
		void start(harness);
	}, [harness, start]);

	const sessionDead = stored?.session?.status === "dead";
	const sessionStopped =
		stored !== undefined && stored !== null && !stored.live;
	// A stopped chat has not lost anything: the agent session it was bound to
	// can be loaded again. Reopening a pane should just work, so do it rather
	// than asking. Dead is different — that load already found no transcript.
	const canResume = Boolean(
		sessionStopped && !sessionDead && harness && agentSessionId,
	);

	// Once per mount: if the session we resume into is itself unusable, fall
	// through to the panel instead of spawning adapters in a loop.
	const autoResumed = useRef(false);
	useEffect(() => {
		if (!canResume || autoResumed.current) return;
		if (!harness || !agentSessionId) return;
		autoResumed.current = true;
		attaching.current = false;
		void start(harness, agentSessionId);
	}, [canResume, harness, agentSessionId, start]);

	if (canResume && !autoResumed.current) {
		return (
			<AcpChatPending>
				<Trans>Resuming the conversation…</Trans>
			</AcpChatPending>
		);
	}

	if (harness && sessionId && (sessionDead || sessionStopped)) {
		return (
			<AcpRecovery
				detail={failure ?? undefined}
				onStartNew={startFresh}
				reason={sessionDead ? "no-transcript" : "stopped"}
			/>
		);
	}

	if (!client || !sessionId) {
		if (failure && harness) {
			return (
				<AcpRecovery
					detail={failure}
					onStartNew={startFresh}
					reason="no-transcript"
				/>
			);
		}
		if (!harness) {
			return (
				<div className="flex h-full w-full items-center justify-center p-4 text-center text-muted-foreground text-xs">
					<Trans>This agent can't be opened as a chat.</Trans>
				</div>
			);
		}
		return (
			<AcpChatPending>
				<Trans>Attaching to the running session…</Trans>
			</AcpChatPending>
		);
	}

	return (
		<SessionView
			client={client}
			key={sessionId}
			onFirstPromptSent={NOOP}
			onSessionState={(state) => {
				// A resume that found no transcript lands on a different agent
				// session. Keep the pane pointed at the live one, or the trip back
				// to the CLI resumes an id that no longer exists.
				const bound = state?.harnessSessionId;
				if (bound && bound !== agent?.sessionId) onAgentSessionChanged(bound);
			}}
			pendingFirstPrompt={null}
			sessionId={sessionId}
			workspaceId={workspaceId}
		/>
	);
}

/** The pane is doing something that takes a moment; an empty pane reads broken. */
function AcpChatPending({ children }: { children: ReactNode }) {
	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-3">
			<Spinner className="size-5" />
			<span className="text-muted-foreground text-xs">{children}</span>
		</div>
	);
}

function NOOP() {}
