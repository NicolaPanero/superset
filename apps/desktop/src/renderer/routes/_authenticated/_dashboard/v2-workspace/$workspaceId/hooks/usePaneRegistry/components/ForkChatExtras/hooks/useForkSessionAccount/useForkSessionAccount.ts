import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { useForkCreationAccount } from "renderer/components/ForkAccountPicker/useForkCreationAccount";
import { useHostUsageQuota } from "renderer/hooks/host-service/useHostUsageQuota";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { TerminalPaneData } from "../../../../../../types";

type SwitchSignInTarget = ReturnType<
	typeof useForkCreationAccount
>["reconnect"];

/**
 * The account picker's controller for a running chat. It reads the account
 * the chat uses; picking another one asks to move the chat instead of
 * changing it in place.
 */
export function useForkSessionAccount(
	workspaceId: string,
	data: TerminalPaneData,
	onChoose: (selection: string | null) => void,
): ReturnType<typeof useForkCreationAccount> {
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const provider = data.agent?.id ?? null;
	const agent = data.acpAgentConfigId ?? provider ?? "";
	const enabled = !!hostUrl && (provider === "claude" || provider === "codex");
	const quota = useHostUsageQuota(enabled ? hostUrl : null);
	const binding = useTerminalAgentBinding(workspaceId, data.terminalId);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [adding, setAdding] = useState(false);
	const [reconnect, setReconnect] = useState<SwitchSignInTarget>(null);
	const options = useQuery({
		queryKey: ["fork-account-options", hostUrl, provider],
		enabled,
		queryFn: () =>
			hostUrl && provider
				? getHostServiceClientByUrl(hostUrl).agents.accountOptions.query({
						agent: provider,
						isolated: true,
					})
				: [],
		staleTime: 5 * 60_000,
	});
	const metadata = useQuery({
		queryKey: ["fork-launch-account", hostUrl, agent],
		enabled,
		queryFn: () =>
			hostUrl
				? getHostServiceClientByUrl(hostUrl).usage.launchAccount.query({
						agent,
						isolated: true,
					})
				: null,
		staleTime: 5 * 60_000,
		retry: false,
	});
	const selection = binding?.account
		? binding.account.selection
		: data.acpAccountSelection !== undefined
			? data.acpAccountSelection
			: (metadata.data?.defaultSelection ??
				quota.data?.find(
					(row) =>
						row.agent === provider && row.isDefault && row.selection !== null,
				)?.selection);
	return {
		hostUrl,
		pickerOpen,
		setPickerOpen,
		adding,
		setAdding,
		reconnect,
		setReconnect,
		quota,
		options,
		refreshDefault: () => metadata.refetch(),
		selection,
		forcedApi: metadata.data?.environmentOverride ?? false,
		enabled,
		available: !!metadata.data,
		choose: (value: string | null) => {
			setPickerOpen(false);
			if (value !== selection) onChoose(value);
		},
		confirm: () => Promise.resolve(true),
	};
}
