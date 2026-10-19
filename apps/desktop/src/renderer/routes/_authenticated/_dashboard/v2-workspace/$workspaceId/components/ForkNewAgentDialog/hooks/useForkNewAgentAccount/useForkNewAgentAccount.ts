import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { useForkCreationAccount } from "renderer/components/ForkAccountPicker";
import { useHostUsageQuota } from "renderer/hooks/host-service/useHostUsageQuota";
import { forkLaunchAccountSelection } from "renderer/lib/fork-account-visibility";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useForkCliOptions } from "renderer/stores/fork-cli-options";

type ForkAccount = ReturnType<typeof useForkCreationAccount>;

/**
 * The account picker's controller for the New agent dialog. The choice lives
 * in the dialog, so it does not touch the new workspace draft.
 */
export function useForkNewAgentAccount(
	hostUrl: string | null,
	configId: string | undefined,
	provider: string | undefined,
	open: boolean,
): ForkAccount {
	const showCliOptions = useForkCliOptions();
	const enabled =
		open && !!hostUrl && (provider === "claude" || provider === "codex");
	const quota = useHostUsageQuota(enabled ? hostUrl : null);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [adding, setAdding] = useState(false);
	const [reconnect, setReconnect] = useState<ForkAccount["reconnect"]>(null);
	const [choice, setChoice] = useState<{
		configId: string | undefined;
		selection: string | null;
	}>();
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
		retry: false,
	});
	const metadata = useQuery({
		queryKey: ["fork-launch-account", hostUrl, configId],
		enabled: enabled && !!configId,
		queryFn: () =>
			hostUrl && configId
				? getHostServiceClientByUrl(hostUrl).usage.launchAccount.query({
						agent: configId,
						isolated: true,
					})
				: null,
		staleTime: 5 * 60_000,
		retry: false,
	});
	const forcedApi = metadata.data?.environmentOverride ?? false;
	const selection =
		!enabled || forcedApi
			? undefined
			: forkLaunchAccountSelection(
					choice && choice.configId === configId
						? choice.selection
						: (metadata.data?.defaultSelection ??
								quota.data?.find(
									(row) =>
										row.agent === provider &&
										row.isDefault &&
										(showCliOptions || row.selection !== null),
								)?.selection),
					options.data ?? [],
					showCliOptions,
				);
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
		forcedApi,
		enabled,
		available: !!metadata.data,
		choose: (value) => {
			setPickerOpen(false);
			setChoice({ configId, selection: value });
		},
		confirm: () => Promise.resolve(true),
	};
}
