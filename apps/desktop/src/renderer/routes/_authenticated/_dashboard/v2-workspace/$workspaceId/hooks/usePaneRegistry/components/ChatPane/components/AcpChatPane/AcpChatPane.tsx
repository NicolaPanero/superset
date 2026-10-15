import { Trans, useLingui } from "@lingui/react/macro";
import { acpHarnessForPreset } from "@superset/chat/core";
import { AGENT_DEFAULT_MODE, type UserContent } from "@superset/chat/protocol";
import { getAgentModelSupport } from "@superset/shared/agent-models";
import { buildChatSessionHandoffPrompt } from "@superset/shared/terminal-session-handoff";
import { alert } from "@superset/ui/atoms/Alert";
import { toast } from "@superset/ui/sonner";
import { useWorkspaceClient } from "@superset/workspace-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import type { OpenFile } from "../../../../../../types";
import { isChatSessionClosed } from "../../../../../../utils/closedChatSessions";
import { prependToDraft } from "../../../ChatSession/components/Composer";
import { SessionView } from "../../../ChatSession/components/SessionView";
import { useSessionClient } from "../../../ChatSession/hooks/useSessionClient";
import type {
	OpenLink,
	OpenPage,
} from "../../../ChatSession/providers/ChatPaneActionsProvider";
import type { ChatForkTarget } from "../../../ChatSession/types";
import { isUnrestrictedMode } from "../../../ChatSession/utils/isUnrestrictedMode";
import { useForkChat } from "../../hooks/useForkChat";
import { readSavedChatMode } from "../../utils/savedChatMode";
import { AcpRecovery } from "./components/AcpRecovery";
import { DraftChat } from "./components/DraftChat";
import { createWhenReachable } from "./utils/createWhenReachable";
import { forkRecoveryFailure } from "./utils/forkRecoveryFailure";
import {
	isChatCreateWatched,
	sharedChatCreate,
	watchChatCreate,
} from "./utils/sharedChatCreate";

/**
 * A chat bridged to an agent session, resumed by its session id. `agent` comes
 * from the pane: the terminal it may have come from is stopped.
 */
const MAX_RECOVERIES = 3;
const REPLACEMENT_TIMEOUT_MS = 30_000;

export interface AgentSwitchTarget {
	presetId: string;
	label: string;
	model: { id: string; label: string } | null;
	modeId: string | undefined;
	handoffPrompt: string | null;
}

export function AcpChatPane({
	agent,
	isActive,
	onSessionInfo,
	onPendingPromptsSent,
	onQueuePrompt,
	onOpenFile,
	onOpenPage,
	onOpenLink,
	onModeChange,
	onSessionCreated,
	onSwitchAgent,
	onForkAgent,
	pendingPrompts,
	sessionId,
	terminalId,
	workspaceId,
	agentConfigId,
	accountSelection,
	modelId,
	modelLabel,
	modeId,
}: {
	workspaceId: string;
	terminalId: string;
	/** `sessionId` is absent until the agent has run a turn to report one. */
	agent: { id: string; sessionId?: string } | undefined;
	isActive: boolean;
	sessionId: string | null;
	pendingPrompts: UserContent[][];
	onPendingPromptsSent: () => void;
	onQueuePrompt: (content: UserContent[]) => void;
	onSessionCreated: (sessionId: string) => void;
	onModeChange?: (modeId: string) => void;
	onSessionInfo: (info: { harnessSessionId?: string; title?: string }) => void;
	onOpenFile?: OpenFile;
	onOpenPage?: OpenPage;
	onOpenLink?: OpenLink;
	onSwitchAgent?: (target: AgentSwitchTarget) => void;
	onForkAgent?: (target: AgentSwitchTarget & { handoffPrompt: string }) => void;
	agentConfigId?: string;
	accountSelection?: string | null;
	modelId?: string;
	modelLabel?: string;
	modeId?: string;
}) {
	const { t } = useLingui();
	const { client, wiring } = useSessionClient(sessionId);
	const { forkToWorktree, canForkToWorktree } = useForkChat(workspaceId);
	const { hostUrl } = useWorkspaceClient();
	const { data: agentConfigs } = useV2AgentConfigs(hostUrl);
	const agentLabel = agentConfigs?.find(
		(config) => config.id === agent?.id,
	)?.label;
	const harness = acpHarnessForPreset(agent?.id);
	const [runtimeDead, setRuntimeDead] = useState(false);
	const [failure, setFailure] = useState<string | null>(null);
	const [unreachable, setUnreachable] = useState(false);
	const [replacement, setReplacement] = useState<string | null>(null);

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
	const queryClient = useQueryClient();
	useWorkspaceEvent(
		"chat:sessions-changed",
		workspaceId,
		() => {
			void queryClient.invalidateQueries({
				queryKey: ["acp-chat-session", sessionId],
			});
			void queryClient.invalidateQueries({
				queryKey: ["acp-chat-replacement"],
			});
		},
		sessionId !== null,
	);

	const createKey = `${terminalId}:${agent?.id ?? ""}`;
	useEffect(() => watchChatCreate(createKey), [createKey]);
	const attaching = useRef(false);
	const recoveryInFlight = useRef(false);
	// A switch to another agent remounts this pane; its pending calls must not
	// write the old agent back over the new one.
	const mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	const start = useCallback(
		async (resumeHarness: string, resume?: string, replacing = false) => {
			attaching.current = true;
			setFailure(null);
			setRuntimeDead(false);
			try {
				const startModeId =
					modeId ??
					(resume || !agent ? undefined : readSavedChatMode(agent.id));
				const commandId = crypto.randomUUID();
				const createdId = await sharedChatCreate(
					createKey,
					() =>
						createWhenReachable({
							attempt: () =>
								wiring.transport
									.createSession({
										commandId,
										workspaceId,
										harness: resumeHarness,
										agentConfigId,
										accountSelection,
										strictResume: Boolean(resume),
										terminalId,
										...(modelId ? { modelId } : {}),
										...(startModeId ? { modeId: startModeId } : {}),
										...(resume ? { resume: { harnessSessionId: resume } } : {}),
									})
									.then((created) => created.sessionId),
							isReachableFailure: (error) =>
								error instanceof TRPCClientError && error.data != null,
							shouldContinue: () => isChatCreateWatched(createKey),
							onUnreachable: (next) => {
								if (mounted.current) setUnreachable(next);
							},
						}),
					(orphan) => {
						void wiring.transport
							.closeSession({ sessionId: orphan })
							.catch(() => undefined);
					},
				);
				if (!mounted.current) return;
				if (replacing) setReplacement(createdId);
				else onSessionCreated(createdId);
			} catch (error) {
				attaching.current = false;
				if (replacing) recoveryInFlight.current = false;
				setFailure(error instanceof Error ? error.message : String(error));
			}
		},
		[
			createKey,
			wiring.transport,
			workspaceId,
			terminalId,
			onSessionCreated,
			modelId,
			modeId,
			agent,
			agentConfigId,
			accountSelection,
		],
	);

	// A pane adopted in the background never saw the stream report the agent
	// session, so recovery takes it from the host's row instead.
	const agentSessionId =
		agent?.sessionId ?? stored?.session?.harnessSessionId ?? undefined;
	// Resuming when there is a session to resume, and a plain new one when the
	// pane was opened straight onto the chat and no agent has run yet.
	useEffect(() => {
		if (sessionId || attaching.current || !harness) return;
		void start(harness, agentSessionId);
	}, [sessionId, harness, agentSessionId, start]);

	const forkReplacement = useRef<{
		sourceId: string;
		deadline: number;
		draftText?: string;
	} | null>(null);
	const forkInFlight = useRef(false);
	const [forking, setForking] = useState(false);
	const forkHere = useCallback(
		async (fromItemId?: string, draftText?: string) => {
			if (!sessionId || forkInFlight.current || recoveryInFlight.current)
				return;
			forkInFlight.current = true;
			setForking(true);
			recoveryInFlight.current = true;
			try {
				const forked = await wiring.transport.forkSession({
					commandId: crypto.randomUUID(),
					sessionId,
					workspaceId,
					...(fromItemId ? { fromItemId } : {}),
				});
				if (!forked) {
					recoveryInFlight.current = false;
					toast.error(t({ message: "This agent can't branch a conversation" }));
					return;
				}
				if (!mounted.current) {
					recoveryInFlight.current = false;
					await wiring.transport.closeSession({ sessionId: forked.sessionId });
					return;
				}
				forkReplacement.current = {
					sourceId: sessionId,
					deadline: Date.now() + REPLACEMENT_TIMEOUT_MS,
					...(fromItemId && draftText ? { draftText } : {}),
				};
				setReplacement(forked.sessionId);
			} catch (error) {
				recoveryInFlight.current = false;
				console.error("[acp-chat] fork failed", error);
				toast.error(t({ message: "Couldn't branch the conversation" }));
			} finally {
				forkInFlight.current = false;
				if (mounted.current) setForking(false);
			}
		},
		[wiring.transport, sessionId, workspaceId, t],
	);

	useEffect(
		() => () => {
			if (replacement && forkReplacement.current) {
				forkReplacement.current = null;
				void wiring.transport
					.closeSession({ sessionId: replacement })
					.catch(() => undefined);
			}
		},
		[replacement, wiring.transport],
	);

	const fork = useCallback(
		(
			target: ChatForkTarget,
			transcript: string,
			fromItemId?: string,
			draftText?: string,
		) => {
			if (target === "workspace") {
				void forkHere(fromItemId, draftText);
				return;
			}
			if (!agent) return;
			void forkToWorktree({
				agentId: agent.id,
				agentLabel: agentLabel ?? agent.id,
				transcript,
			});
		},
		[forkHere, forkToWorktree, agent, agentLabel],
	);

	const startFresh = useCallback(() => {
		if (!harness) return;
		attaching.current = false;
		void start(harness);
	}, [harness, start]);

	const agentSwitch = useMemo(() => {
		if (!agent || !onSwitchAgent) return undefined;
		const presetIds = [
			...new Set((agentConfigs ?? []).map((config) => config.presetId)),
		].filter(
			(presetId) => presetId === agent.id && acpHarnessForPreset(presetId),
		);
		if (!presetIds.includes(agent.id)) return undefined;
		return {
			currentPresetId: agent.id,
			agents: presetIds.map((presetId) => ({
				presetId,
				label:
					agentConfigs?.find((config) => config.presetId === presetId)?.label ??
					presetId,
				models: (getAgentModelSupport(presetId)?.models ?? []).map(
					({ id, label }) => ({ id, label }),
				),
			})),
			onSwitch: async (
				presetId: string,
				nextModel: { id: string; label: string } | null,
				transcript: string,
				currentModeId: string | undefined,
			) => {
				const label =
					agentConfigs?.find((config) => config.presetId === presetId)?.label ??
					presetId;
				const currentLabel =
					agentConfigs?.find((config) => config.presetId === agent.id)?.label ??
					agent.id;
				const target: AgentSwitchTarget = {
					presetId,
					label,
					model: nextModel,
					// Never more access than the chat being left, unless the user
					// already chose otherwise for the agent being switched to.
					modeId:
						readSavedChatMode(presetId) ??
						(isUnrestrictedMode(currentModeId)
							? undefined
							: AGENT_DEFAULT_MODE),
					handoffPrompt: transcript.trim()
						? buildChatSessionHandoffPrompt({
								transcript,
								sourceAgentLabel: currentLabel,
							})
						: null,
				};
				const { handoffPrompt } = target;
				if (handoffPrompt && onForkAgent) {
					alert({
						title: t({ message: `Continue in a new ${label} chat?` }),
						description: t({
							message: `A chat can't switch to another provider partway through. Fork this conversation into a new ${label} chat instead. This ${currentLabel} chat stays open.`,
						}),
						actions: [
							{
								label: t({ message: "Fork to new chat" }),
								variant: "default",
								onClick: () => onForkAgent({ ...target, handoffPrompt }),
							},
							{ label: t({ message: "Cancel" }), variant: "ghost" },
						],
					});
					return;
				}
				if (sessionId) {
					try {
						await wiring.transport.closeSession({ sessionId });
					} catch (error) {
						console.warn("[acp-chat] could not stop the chat session", error);
						toast.error(t({ message: "Couldn't stop the chat" }));
						return;
					}
				}
				if (!mounted.current) return;
				onSwitchAgent(target);
			},
		};
	}, [
		agent,
		agentConfigs,
		onSwitchAgent,
		onForkAgent,
		sessionId,
		t,
		wiring.transport,
	]);

	const sessionDead = runtimeDead || stored?.session?.status === "dead";
	const sessionStopped =
		stored !== undefined && stored !== null && !stored.live;
	// A stopped or dead chat has not lost anything: the agent session it was
	// bound to can be loaded again. Dead means the agent exited or failed to
	// start, and a later attempt may get past either. Reopening a pane should
	// just work, so do it.
	const bindings = useTerminalAgentBindings(workspaceId);
	const continuedInTerminal =
		agentSessionId !== undefined &&
		[...bindings.values()].some(
			(binding) =>
				binding.agentSessionId === agentSessionId &&
				!binding.chatSessionId &&
				binding.endedAt === undefined,
		);
	const recoverable = Boolean(
		sessionId &&
			!isChatSessionClosed(sessionId) &&
			(sessionStopped || sessionDead) &&
			harness &&
			!continuedInTerminal,
	);
	const recoveries = useRef(0);
	if (stored?.live && !sessionDead) recoveries.current = 0;
	const recover = useCallback(() => {
		if (
			!harness ||
			!sessionId ||
			isChatSessionClosed(sessionId) ||
			recoveryInFlight.current
		)
			return;
		recoveryInFlight.current = true;
		void wiring.transport
			.closeSession({ sessionId })
			.catch(() => undefined)
			.then(() => start(harness, agentSessionId, true));
	}, [harness, agentSessionId, sessionId, start, wiring.transport]);
	const { data: replacementState } = useQuery({
		enabled: replacement !== null,
		queryKey: ["acp-chat-replacement", replacement],
		queryFn: async () => {
			if (!replacement) return null;
			const state = await wiring.transport.getSession({
				sessionId: replacement,
			});
			const forkFailure =
				state.session?.status === "dead"
					? await forkRecoveryFailure(wiring.transport, replacement)
					: null;
			return { ...state, forkFailure };
		},
		refetchInterval: 500,
		refetchIntervalInBackground: true,
	});
	useEffect(() => {
		if (!replacement) return;
		const commit = () => {
			const branched = forkReplacement.current;
			forkReplacement.current = null;
			if (branched?.draftText)
				prependToDraft(`chat-v3-draft:${terminalId}`, branched.draftText);
			recoveryInFlight.current = false;
			onSessionCreated(replacement);
			if (branched)
				void wiring.transport
					.closeSession({ sessionId: branched.sourceId })
					.catch((error) =>
						console.warn("[acp-chat] could not stop source session", error),
					);
			setReplacement(null);
		};
		const status = replacementState?.session?.status;
		if (status === "dead") {
			if (forkReplacement.current) {
				forkReplacement.current = null;
				recoveryInFlight.current = false;
				setReplacement(null);
				void wiring.transport
					.closeSession({ sessionId: replacement })
					.catch(() => undefined);
				toast.error(t({ message: "Couldn't branch the conversation" }));
				return;
			}
			recoveryInFlight.current = false;
			setReplacement(null);
			const cause = replacementState?.forkFailure;
			if (cause?.kind === "account" || cause?.kind === "missing")
				recoveries.current = MAX_RECOVERIES;
			setFailure(
				cause?.kind === "account"
					? t({ message: "Reconnect account" })
					: cause?.kind === "missing"
						? t({
								message:
									"The agent could not load this conversation. Check the account used for this chat, then retry.",
							})
						: (cause?.message ??
							t({
								message: "The agent stopped while resuming the conversation.",
							})),
			);
			return;
		}
		if (replacementState?.live && status !== "starting") {
			commit();
			return;
		}
		const timer = setTimeout(
			() => {
				if (!forkReplacement.current) {
					commit();
					return;
				}
				forkReplacement.current = null;
				recoveryInFlight.current = false;
				setReplacement(null);
				void wiring.transport
					.closeSession({ sessionId: replacement })
					.catch(() => undefined);
				toast.error(t({ message: "Couldn't branch the conversation" }));
			},
			Math.max(
				0,
				(forkReplacement.current?.deadline ??
					Date.now() + REPLACEMENT_TIMEOUT_MS) - Date.now(),
			),
		);
		return () => clearTimeout(timer);
	}, [
		replacement,
		replacementState,
		onSessionCreated,
		terminalId,
		wiring.transport,
		t,
	]);
	const recovering =
		forking ||
		replacement !== null ||
		(recoverable && recoveries.current < MAX_RECOVERIES);
	useEffect(() => {
		if (!recovering || recoveryInFlight.current) return;
		const delayMs =
			recoveries.current === 0 && failure === null
				? 0
				: 1_000 * 2 ** Math.max(recoveries.current - 1, 0);
		const timer = setTimeout(() => {
			recoveries.current += 1;
			recover();
		}, delayMs);
		return () => clearTimeout(timer);
	}, [recovering, recover, failure]);
	const retryRecovery = useCallback(() => {
		recoveries.current = 0;
		setFailure(null);
		recover();
	}, [recover]);

	const draftKey = `chat-v3-draft:${terminalId}`;
	const draft = (notice: ReactNode) => (
		<DraftChat
			draftKey={draftKey}
			isActive={isActive}
			notice={
				unreachable ? <Trans>Connecting to the host service…</Trans> : notice
			}
			onQueue={onQueuePrompt}
			queued={pendingPrompts}
			workspaceId={workspaceId}
		/>
	);

	if (harness && sessionId && (sessionDead || sessionStopped) && !recovering) {
		return (
			<AcpRecovery
				detail={failure ?? undefined}
				onRetry={() => {
					if (!harness) return;
					attaching.current = false;
					void start(harness, agentSessionId);
				}}
				onStartNew={startFresh}
				{...(continuedInTerminal ? {} : { onResume: retryRecovery })}
				reason={continuedInTerminal ? "in-terminal" : "stopped"}
			/>
		);
	}

	if (!client || !sessionId) {
		if (failure && harness) {
			return (
				<AcpRecovery
					detail={failure}
					onRetry={() => {
						if (!harness) return;
						attaching.current = false;
						void start(harness, agentSessionId);
					}}
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
		return draft(
			agentSessionId ? (
				<Trans>Attaching to the running session…</Trans>
			) : (
				<Trans>Starting the agent…</Trans>
			),
		);
	}

	return (
		<SessionView
			client={client}
			draftKey={draftKey}
			{...(recovering
				? {
						held: {
							notice: unreachable ? (
								<Trans>Connecting to the host service…</Trans>
							) : (
								<Trans>Resuming the conversation…</Trans>
							),
							queued: pendingPrompts,
							onQueue: onQueuePrompt,
						},
					}
				: {})}
			key={sessionId}
			onPendingPromptsSent={onPendingPromptsSent}
			agentLabel={agentLabel}
			agentSwitch={agentSwitch}
			onModeChange={onModeChange}
			canForkToWorktree={canForkToWorktree}
			isActive={isActive}
			onFork={fork}
			onRewind={(itemId, text) => {
				void forkHere(itemId, text);
			}}
			openFile={onOpenFile}
			openPage={onOpenPage}
			openLink={onOpenLink}
			onSessionState={(state, promptTitle) => {
				// A resume that found no transcript lands on a different agent
				// session. Keep the pane pointed at the live one, or the trip back
				// to the CLI resumes an id that no longer exists.
				if (state?.status === "dead") setRuntimeDead(true);
				const bound = state?.harnessSessionId;
				if (!mounted.current) return;
				onSessionInfo({
					...(bound && bound !== agent?.sessionId
						? { harnessSessionId: bound }
						: {}),
					...(state?.title || promptTitle
						? { title: state?.title || promptTitle }
						: {}),
				});
			}}
			pendingPrompts={pendingPrompts}
			preferredModelLabel={modelLabel}
			workspaceId={workspaceId}
		/>
	);
}
