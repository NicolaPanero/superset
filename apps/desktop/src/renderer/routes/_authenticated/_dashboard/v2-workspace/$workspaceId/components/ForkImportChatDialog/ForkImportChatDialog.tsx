import { useLingui } from "@lingui/react/macro";
import { acpHarnessForPreset } from "@superset/chat/core";
import { errorMessage } from "@superset/i18n/errors";
import type { WorkspaceStore } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useForkExternalSessions } from "renderer/hooks/host-service/useForkExternalSessions";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import {
	type ExternalSession,
	ForkChatSearchDialog,
	sessionKey,
} from "renderer/routes/_authenticated/components/ForkChatSearchDialog";
import type { StoreApi } from "zustand/vanilla";
import { useAgentSessionLauncher } from "../../hooks/useAgentSessionLauncher";
import type { PaneViewerData } from "../../types";

export type ForkResumeRequest = {
	key: string;
	configId: string;
};

/** Finds local chats and reuses sessions already connected to Superset. */
export function ForkImportChatDialog({
	open,
	onOpenChange,
	onImported,
	store,
	workspaceId,
	resume,
	onResumeConsumed,
}: {
	resume?: ForkResumeRequest;
	onResumeConsumed?: () => void;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onImported: () => void;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	workspaceId: string;
}) {
	const { t } = useLingui();
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const { data: configs = [] } = useV2AgentConfigs(hostUrl);
	const { openAgentChat, focusAgentTerminal } = useAgentSessionLauncher({
		workspaceId,
		store,
	});
	const navigate = useNavigate();
	const [busy, setBusy] = useState<string | null>(null);
	const listing = useForkExternalSessions(
		{ workspaceId },
		open || Boolean(resume),
	);
	const { data: capabilities } =
		workspaceTrpc.sessionTransfer.capabilities.useQuery(undefined, {
			enabled: open,
			retry: false,
			staleTime: 60_000,
		});
	const { mutateAsync: prepareCursorSurface } =
		workspaceTrpc.agents.prepareCursorSurface.useMutation();
	const { mutateAsync: prepareAcpLaunch } =
		workspaceTrpc.agents.prepareAcpLaunch.useMutation();
	const { mutateAsync: prepareFromChat } =
		workspaceTrpc.sessionTransfer.prepareFromChat.useMutation();
	const { mutateAsync: bringClaudeChat } =
		workspaceTrpc.sessionTransfer.bringClaudeChat.useMutation();
	const { mutateAsync: parkChat } = workspaceTrpc.agents.parkChat.useMutation();

	const sessions = (listing.data ?? []) as ExternalSession[];
	const chatConfig = (presetId: string) =>
		configs.find(
			(config) =>
				config.presetId === presetId && acpHarnessForPreset(config.presetId),
		);
	const verified = (presetId: string) =>
		Boolean(
			capabilities?.nativeAvailable &&
				capabilities.adapters.find((adapter) => adapter.agent === presetId)
					?.verified,
		);
	/** Where a chat opens: its own folder's workspace, else this one. */
	const homeOf = (session: ExternalSession) =>
		session.workspaceId ?? workspaceId;

	/** Opens a chat in another workspace by handing it over as a background chat. */
	const openThere = async (
		home: string,
		paneData: {
			terminalId: string;
			agentId: string;
			sessionId: string;
			configId: string;
			accountSelection?: string | null;
		},
		title: string,
	) => {
		await parkChat({
			workspaceId: home,
			terminalId: paneData.terminalId,
			title,
			paneData: {
				terminalId: paneData.terminalId,
				agentSurface: "acp",
				agent: { id: paneData.agentId, sessionId: paneData.sessionId },
				acpAgentConfigId: paneData.configId,
				...(paneData.accountSelection !== undefined
					? { acpAccountSelection: paneData.accountSelection }
					: {}),
			},
		});
		await navigateToV2Workspace(home, navigate, {
			search: {
				terminalId: paneData.terminalId,
				focusRequestId: crypto.randomUUID(),
			},
		});
	};

	const run = async (session: ExternalSession, targetConfigId: string) => {
		const key = sessionKey(session);
		const target = configs.find((config) => config.id === targetConfigId);
		const targetPresetId = target?.presetId;
		const source = chatConfig(session.agent);
		const managed = session.agent === "claude" || session.agent === "codex";
		const home = homeOf(session);
		const here = home === workspaceId;
		const title =
			session.title ?? session.preview ?? target?.label ?? session.agent;
		setBusy(key);
		try {
			if (
				((targetPresetId === session.agent && target?.id === source?.id) ||
					!targetConfigId) &&
				session.terminalId
			) {
				if (here) focusAgentTerminal(session.terminalId);
				else
					await navigateToV2Workspace(home, navigate, {
						search: {
							terminalId: session.terminalId,
							focusRequestId: crypto.randomUUID(),
						},
					});
				onOpenChange(false);
				onImported();
				return;
			}
			if (!target || !targetPresetId) return;
			if (targetPresetId === session.agent) {
				if (session.agent === "cursor-agent")
					await prepareCursorSurface({
						workspaceId: home,
						configId: target.id,
						sessionId: session.sessionId,
						from: "cli",
					});
				if (
					session.workspaceId === null &&
					session.agent === "claude" &&
					session.cwd
				)
					await bringClaudeChat({
						workspaceId,
						sessionId: session.sessionId,
						accountSelection: session.accountSelection,
						sourceCwd: session.cwd,
					});
				const account = managed
					? { accountSelection: session.accountSelection }
					: {};
				if (here) {
					const opened = await openAgentChat({
						configId: target.id,
						placement: "new-tab",
						resumeSessionId: session.sessionId,
						...account,
					});
					if (!opened) throw new Error("chat_unavailable");
				} else
					await openThere(
						home,
						{
							terminalId: crypto.randomUUID(),
							agentId: session.agent,
							sessionId: session.sessionId,
							configId: target.id,
							...account,
						},
						title,
					);
			} else {
				const launch = await prepareAcpLaunch({
					workspaceId: home,
					configId: target.id,
				});
				const targetTerminalId = crypto.randomUUID();
				const transfer = await prepareFromChat({
					workspaceId: home,
					transferId: crypto.randomUUID(),
					sourceTerminalId: crypto.randomUUID(),
					sourceConfigId: source?.id ?? session.agent,
					sourceSessionId: session.sessionId,
					...(managed
						? { sourceAccountSelection: session.accountSelection }
						: {}),
					targetConfigId: launch.agentConfigId,
					...(launch.accountSelection !== undefined
						? { targetAccountSelection: launch.accountSelection }
						: {}),
					targetTerminalId,
					sourceExternal: true,
				});
				if (here) {
					const opened = await openAgentChat({
						configId: launch.agentConfigId,
						accountSelection: launch.accountSelection,
						placement: "new-tab",
						resumeSessionId: transfer.targetSessionId,
						terminalId: targetTerminalId,
					});
					if (!opened) throw new Error("chat_unavailable");
				} else
					await openThere(
						home,
						{
							terminalId: targetTerminalId,
							agentId: targetPresetId,
							sessionId: transfer.targetSessionId,
							configId: launch.agentConfigId,
							accountSelection: launch.accountSelection,
						},
						title,
					);
			}
			toast.success(t({ message: "Chat imported" }), {
				description: session.title ?? session.preview ?? undefined,
			});
			onOpenChange(false);
			onImported();
		} catch (error) {
			toast.error(t({ message: "Couldn't import the chat" }), {
				description: errorMessage(error, t({ message: "Unknown error" })),
			});
		} finally {
			setBusy(null);
		}
	};

	const resumed = useRef(false);
	useEffect(() => {
		if (!resume || resumed.current || !listing.data) return;
		resumed.current = true;
		const session = sessions.find((entry) => sessionKey(entry) === resume.key);
		onResumeConsumed?.();
		if (!session) {
			toast.error(t({ message: "Couldn't import the chat" }));
			return;
		}
		void run(session, resume.configId);
	});

	return (
		<ForkChatSearchDialog
			open={open}
			onOpenChange={onOpenChange}
			sessions={sessions}
			isPending={listing.isPending}
			isFetching={listing.isFetching}
			error={listing.error?.message}
			loadingPreviews={listing.loadingPreviews}
			onRefresh={() => void listing.refetch()}
			configs={configs}
			verified={verified}
			busyKey={busy}
			currentWorkspaceId={workspaceId}
			onRun={run}
		/>
	);
}
