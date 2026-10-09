import { useLingui } from "@lingui/react/macro";
import { acpHarnessForPreset } from "@superset/chat/core";
import { errorMessage } from "@superset/i18n/errors";
import type { WorkspaceStore } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { useWorkspaceClient, workspaceTrpc } from "@superset/workspace-client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useAwaitAcpChatEnabled } from "renderer/hooks/useAcpChatEnabled";
import { useTerminalAppearance } from "renderer/hooks/useTerminalAppearance";
import {
	useV2AgentConfigs,
	v2AgentConfigsQueryOptions,
} from "renderer/hooks/useV2AgentConfigs";
import { validateAccountLaunch } from "renderer/lib/fork-account-launch";
import { terminalQueryColors } from "renderer/lib/terminal/terminal-query-colors";
import type { StoreApi } from "zustand/vanilla";
import type {
	ChatPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";
import {
	focusOrAddTerminalPane,
	focusTerminalPane,
} from "../../utils/focusTerminalPane";
import { useForkBackgroundChats } from "../useForkBackgroundChats";

export interface CreateNewAgentSessionInput {
	nativeTerminal?: boolean;
	accountValidated?: boolean;
	accountSelection?: string | null;
	configId: string;
	placement: "split-pane" | "new-tab";
	prompt: string;
	forkSessionId?: string;
	nativeTransferId?: string;
	attachments?: Array<{ attachmentId: string; name: string; mimeType: string }>;
	modelId?: string;
	modeId?: string;
}

export type CreateNewAgentSession = (
	input: CreateNewAgentSessionInput,
) => Promise<{ terminalId: string } | null>;

export type OpenAgentChat = (
	input: Omit<CreateNewAgentSessionInput, "forkSessionId" | "prompt"> & {
		prompt?: string;
		resumeSessionId?: string;
		terminalId?: string;
		presetId?: string;
	},
) => Promise<{ terminalId: string } | null>;

interface UseAgentSessionLauncherOptions {
	workspaceId: string;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
}

export function useAgentSessionLauncher({
	workspaceId,
	store,
}: UseAgentSessionLauncherOptions): {
	createNewAgentSession: CreateNewAgentSession;
	openAgentChat: OpenAgentChat;
	focusAgentTerminal: (terminalId: string) => void;
} {
	const { t } = useLingui();
	const prepareAcpLaunch = workspaceTrpc.agents.prepareAcpLaunch.useMutation();
	const runAgent = workspaceTrpc.agents.run.useMutation();
	const launchTransfer = workspaceTrpc.sessionTransfer.launch.useMutation();
	const appearance = useTerminalAppearance();
	const awaitAcpChatEnabled = useAwaitAcpChatEnabled();
	const { hostUrl } = useWorkspaceClient();
	const { data: agentConfigs } = useV2AgentConfigs(hostUrl);
	const queryClient = useQueryClient();

	const openAgentChat = useCallback<OpenAgentChat>(
		async (input) => {
			// A handoff out of an open chat continues it, so the flag that gates
			// new chats does not apply.
			if (!input.resumeSessionId && !(await awaitAcpChatEnabled())) return null;
			const configs = await queryClient
				.ensureQueryData(v2AgentConfigsQueryOptions(hostUrl))
				.catch(() => agentConfigs ?? []);
			const config =
				configs.find((entry) => entry.id === input.configId) ??
				configs.find((entry) => entry.presetId === input.presetId);
			const presetId = config?.presetId;
			if (!presetId || !acpHarnessForPreset(presetId)) return null;
			if (
				!input.accountValidated &&
				!(await validateAccountLaunch({
					hostUrl,
					agent: config.id,
					provider: presetId,
					selection: input.accountSelection,
					model: input.modelId,
				}))
			)
				return null;
			let launch: Awaited<ReturnType<typeof prepareAcpLaunch.mutateAsync>>;
			try {
				launch = await prepareAcpLaunch.mutateAsync({
					workspaceId,
					configId: input.configId,
					accountSelection: input.accountSelection,
				});
			} catch (error) {
				toast.error(
					t({ message: "ACP chat is unavailable. Opening the terminal." }),
					{ description: errorMessage(error, t({ message: "Unknown error" })) },
				);
				return null;
			}
			const state = store.getState();
			const terminalId = input.terminalId ?? crypto.randomUUID();
			const label = config?.label;
			const pane = {
				kind: "chat-v3" as const,
				...(label ? { titleOverride: label } : {}),
				data: {
					terminalId,
					sessionId: null,
					acpAgentConfigId: launch.agentConfigId,
					acpAccountSelection: launch.accountSelection,
					agent: input.resumeSessionId
						? { id: presetId, sessionId: input.resumeSessionId }
						: { id: presetId },
					...(input.prompt ? { pendingPrompt: input.prompt } : {}),
					...(input.attachments?.length
						? { pendingAttachments: input.attachments }
						: {}),
					...((input.modelId ?? launch.defaultModelId)
						? {
								chatModelId:
									input.modelId ?? launch.defaultModelId ?? undefined,
							}
						: {}),
					...(input.modeId ? { chatModeId: input.modeId } : {}),
				} satisfies ChatPaneData,
			};
			if (input.placement === "split-pane" && state.activeTabId) {
				state.addPane({ tabId: state.activeTabId, pane });
			} else {
				state.addTab({ panes: [pane] });
			}
			return { terminalId };
		},
		[
			awaitAcpChatEnabled,
			queryClient,
			hostUrl,
			agentConfigs,
			store,
			prepareAcpLaunch,
			workspaceId,
			t,
		],
	);

	const createNewAgentSession = useCallback<CreateNewAgentSession>(
		async (input) => {
			const configs = await queryClient
				.ensureQueryData(v2AgentConfigsQueryOptions(hostUrl))
				.catch(() => agentConfigs ?? []);
			const config = configs.find((entry) => entry.id === input.configId);
			if (
				!config ||
				!(await validateAccountLaunch({
					hostUrl,
					agent: config.id,
					provider: config.presetId,
					selection: input.accountSelection,
					model: input.modelId,
				}))
			)
				return null;
			input = { ...input, accountValidated: true };
			if (
				!input.nativeTerminal &&
				!input.forkSessionId &&
				!input.nativeTransferId
			) {
				const chat = await openAgentChat(input);
				if (chat) return chat;
			}

			try {
				// Host pipeline bakes the prompt into the initialCommand using the
				// agent's argv/stdin transport — no follow-up writeInput needed,
				// no bind-wait race vs. the launching shell.
				const result = input.nativeTransferId
					? await launchTransfer.mutateAsync({
							workspaceId,
							transferId: input.nativeTransferId,
							colors: terminalQueryColors(appearance.theme),
						})
					: await runAgent.mutateAsync({
							workspaceId,
							colors: terminalQueryColors(appearance.theme),
							agent: input.configId,
							prompt: input.prompt,
							...(input.accountSelection !== undefined
								? { accountSelection: input.accountSelection }
								: {}),
							...(input.attachments?.length
								? {
										attachmentIds: input.attachments.map(
											(attachment) => attachment.attachmentId,
										),
									}
								: {}),
							...(input.modelId ? { model: input.modelId } : {}),
							...(input.modeId ? { mode: input.modeId } : {}),
							...(input.forkSessionId
								? { forkSessionId: input.forkSessionId }
								: {}),
						});
				if (result.kind !== "terminal") {
					toast.error(
						t({
							message: "Selected agent isn't a terminal agent",
						}),
					);
					return null;
				}
				const terminalId = result.sessionId;
				if (focusTerminalPane(store, terminalId)) return { terminalId };
				const state = store.getState();
				const pane = {
					kind: "terminal" as const,
					titleOverride: result.label,
					data: { terminalId } as TerminalPaneData,
				};
				if (input.placement === "split-pane" && state.activeTabId) {
					state.addPane({ tabId: state.activeTabId, pane });
				} else {
					state.addTab({ panes: [pane] });
				}
				return { terminalId };
			} catch (error) {
				const description = errorMessage(
					error,
					t({
						message: "Unknown error",
					}),
				);
				toast.error(
					t({
						message: "Couldn't start agent session",
					}),
					{ description },
				);
				return null;
			}
		},
		[
			runAgent,
			launchTransfer,
			store,
			workspaceId,
			t,
			appearance.theme,
			openAgentChat,
			hostUrl,
			queryClient,
			agentConfigs,
		],
	);

	const { reopenParked } = useForkBackgroundChats(workspaceId);
	const focusAgentTerminal = useCallback(
		(terminalId: string) => {
			if (reopenParked(store, terminalId)) return;
			focusOrAddTerminalPane(store, terminalId);
		},
		[store, reopenParked],
	);

	return { createNewAgentSession, openAgentChat, focusAgentTerminal };
}
