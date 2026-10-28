import { Trans, useLingui } from "@lingui/react/macro";
import type { SessionConfigOption } from "@superset/chat/protocol";
import type { RendererContext } from "@superset/panes";
import {
	DropdownMenuItem,
	DropdownMenuPortal,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useEffect, useRef, useState } from "react";
import { LuCopy, LuRepeat2 } from "react-icons/lu";
import { ForkAccountPicker } from "renderer/components/ForkAccountPicker";
import { ForkAccountResets } from "renderer/components/ForkAccountResets";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import type { PaneViewerData, TerminalPaneData } from "../../../../../../types";
import type { OpenAgentChat } from "../../../../../useAgentSessionLauncher/useAgentSessionLauncher";
import { useChatWiring } from "../../../ChatSession/hooks/useSessionClient";
import { useForkAccountSwitch } from "../../hooks/useForkAccountSwitch";
import { useForkSessionAccount } from "../../hooks/useForkSessionAccount";
import {
	clearPendingEffort,
	peekPendingEffort,
	pendingEffortChange,
} from "../../utils/pendingEffort";
import {
	clearPendingModelReset,
	hasPendingModelReset,
	pendingModelResetChange,
} from "../../utils/pendingModelReset";
import { ForkAccountStopConfirm } from "../ForkAccountStopConfirm";
import {
	ForkChatSwitchDialog,
	type ForkSwitchRequest,
} from "../ForkChatSwitchDialog";
import { ForkContextMeter } from "../ForkContextMeter";
import { ForkQuotaRecoveryControls } from "../ForkQuotaRecoveryControls";
import { ForkSessionModelPicker } from "../ForkSessionModelPicker";

/** The chat composer's model picker and account ring, as on the new workspace screen. */
export function ForkSessionControls({
	ctx,
	workspaceId,
	data,
	openAgentChat,
	configOptions,
	onSelect,
}: {
	ctx: RendererContext<PaneViewerData>;
	workspaceId: string;
	data: TerminalPaneData;
	openAgentChat: OpenAgentChat;
	configOptions: SessionConfigOption[];
	onSelect?: (configId: string, value: string) => void;
}) {
	const { t } = useLingui();
	const [request, setRequest] = useState<ForkSwitchRequest | null>(null);
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const { data: configs = [] } = useV2AgentConfigs(hostUrl);
	const configId = data.acpAgentConfigId ?? data.agent?.id ?? "";
	const accountSwitcher = useForkAccountSwitch(workspaceId, ctx);
	const wiring = useChatWiring();
	const [stopFor, setStopFor] = useState<{ selection: string | null } | null>(
		null,
	);
	// Moving a Claude chat to another login needs no options: only a running
	// turn asks first, because the move stops it.
	const chooseAccount = async (selection: string | null) => {
		if (!accountSwitcher) {
			setRequest({ configId, accountSelection: selection });
			return;
		}
		const source = data.acpSessionId
			? await wiring.transport
					.getSession({ sessionId: data.acpSessionId })
					.catch(() => null)
			: null;
		const status = source?.session?.status;
		if (source?.live && (status === "running" || status === "awaiting_input")) {
			setStopFor({ selection });
			return;
		}
		await accountSwitcher.onSwitch(selection);
	};
	const account = useForkSessionAccount(
		workspaceId,
		data,
		(selection) => void chooseAccount(selection),
	);
	const stopAccountName = stopFor
		? (accountSwitcher?.accounts.find(
				(choice) => choice.selection === stopFor.selection,
			)?.name ?? "")
		: null;
	const provider = data.agent?.id ?? null;
	const modelId = configOptions.find(
		(option) => option.category === "model",
	)?.currentValue;
	const usage = account.quota.data?.find(
		(row) => row.agent === provider && row.selection === account.selection,
	);
	// A Claude chat resumed from another agent's transcript (switch, account
	// change, automatic continuation) reports that agent's model; select Default.
	const resetTried = useRef(new Set<string>());
	useEffect(() => {
		if (!onSelect) return;
		const pending = hasPendingModelReset(data.terminalId);
		if (!pending && provider !== "claude") return;
		if (
			!configOptions.some(
				(entry) => entry.category === "model" && entry.options.length > 0,
			)
		)
			return;
		clearPendingModelReset(data.terminalId);
		const change = pendingModelResetChange(configOptions);
		const key = `${data.terminalId}:${modelId ?? ""}`;
		if (!change || resetTried.current.has(key)) return;
		resetTried.current.add(key);
		onSelect(change.configId, change.value);
	}, [configOptions, data.terminalId, onSelect, provider, modelId]);

	// The effort picked before a switch reaches the new session once it lists it.
	useEffect(() => {
		const effort = peekPendingEffort(data.terminalId);
		if (!effort || !onSelect) return;
		if (!configOptions.some((entry) => entry.category === "thought_level"))
			return;
		clearPendingEffort(data.terminalId);
		const change = pendingEffortChange(configOptions, effort);
		if (change) onSelect(change.configId, change.value);
	}, [configOptions, data.terminalId, onSelect]);

	const sessionId = data.agent?.sessionId;
	const recovers = provider === "claude" || provider === "codex";
	const extraItems = (
		<>
			{recovers && (
				<DropdownMenuSub>
					<DropdownMenuSubTrigger className="gap-2">
						<LuRepeat2 className="size-3.5 shrink-0 text-muted-foreground" />
						<Trans>Automatic continuation</Trans>
					</DropdownMenuSubTrigger>
					<DropdownMenuPortal>
						<DropdownMenuSubContent className="w-80 p-3">
							<ForkQuotaRecoveryControls
								workspaceId={workspaceId}
								terminalId={data.terminalId}
								enabled
								agent={provider ?? undefined}
							/>
						</DropdownMenuSubContent>
					</DropdownMenuPortal>
				</DropdownMenuSub>
			)}
			{usage && (
				<div className="px-2 py-1 text-xs">
					<ForkAccountResets
						hostUrl={account.hostUrl}
						account={usage}
						hideEmail
					/>
				</div>
			)}
			{sessionId && (
				<DropdownMenuItem
					onSelect={() =>
						void navigator.clipboard
							.writeText(sessionId)
							.then(() => toast.success(t({ message: "Copied" })))
					}
				>
					<LuCopy className="size-3.5 shrink-0 text-muted-foreground" />
					<Trans>Copy session ID</Trans>
				</DropdownMenuItem>
			)}
		</>
	);

	return (
		<>
			<ForkSessionModelPicker
				hostUrl={hostUrl}
				workspaceId={workspaceId}
				configs={configs}
				data={data}
				configOptions={configOptions}
				onSelect={onSelect}
				onRequestSwitch={setRequest}
			/>
			<ForkContextMeter terminalId={data.terminalId} agent={provider} />
			<ForkAccountPicker
				account={account}
				provider={provider}
				model={modelId}
				compact
				extraItems={extraItems}
			/>
			<ForkAccountStopConfirm
				accountName={stopAccountName}
				switching={accountSwitcher?.switching === true}
				onCancel={() => setStopFor(null)}
				onConfirm={() => {
					if (!stopFor || !accountSwitcher) return;
					void accountSwitcher
						.onSwitch(stopFor.selection)
						.finally(() => setStopFor(null));
				}}
			/>
			<ForkChatSwitchDialog
				ctx={ctx}
				workspaceId={workspaceId}
				data={data}
				request={request}
				onOpenAgentChat={openAgentChat}
				onClose={() => setRequest(null)}
			/>
		</>
	);
}
