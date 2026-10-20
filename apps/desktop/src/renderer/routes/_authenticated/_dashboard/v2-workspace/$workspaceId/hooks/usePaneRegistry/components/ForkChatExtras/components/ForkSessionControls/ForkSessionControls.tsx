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
import { useEffect, useState } from "react";
import { LuCopy, LuRepeat2 } from "react-icons/lu";
import { ForkAccountPicker } from "renderer/components/ForkAccountPicker";
import { ForkAccountResets } from "renderer/components/ForkAccountResets";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import type { PaneViewerData, TerminalPaneData } from "../../../../../../types";
import type { OpenAgentChat } from "../../../../../useAgentSessionLauncher/useAgentSessionLauncher";
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
import {
	ForkChatSwitchDialog,
	type ForkSwitchRequest,
} from "../ForkChatSwitchDialog";
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
	const { data: configs = [] } = useV2AgentConfigs(
		useWorkspaceHostUrl(workspaceId),
	);
	const configId = data.acpAgentConfigId ?? data.agent?.id ?? "";
	const account = useForkSessionAccount(workspaceId, data, (selection) =>
		setRequest({ configId, accountSelection: selection }),
	);
	const provider = data.agent?.id ?? null;
	const modelId = configOptions.find(
		(option) => option.category === "model",
	)?.currentValue;
	const usage = account.quota.data?.find(
		(row) => row.agent === provider && row.selection === account.selection,
	);
	useEffect(() => {
		if (!onSelect || !hasPendingModelReset(data.terminalId)) return;
		if (
			!configOptions.some(
				(entry) => entry.category === "model" && entry.options.length > 0,
			)
		)
			return;
		clearPendingModelReset(data.terminalId);
		const change = pendingModelResetChange(configOptions);
		if (change) onSelect(change.configId, change.value);
	}, [configOptions, data.terminalId, onSelect]);

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
				configs={configs}
				data={data}
				configOptions={configOptions}
				onSelect={onSelect}
				onRequestSwitch={setRequest}
			/>
			<ForkAccountPicker
				account={account}
				provider={provider}
				model={modelId}
				compact
				extraItems={extraItems}
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
