import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useHostUsageQuota } from "renderer/hooks/host-service/useHostUsageQuota";
import { validateAccountLaunch } from "renderer/lib/fork-account-launch";
import { forkLaunchAccountSelection } from "renderer/lib/fork-account-visibility";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { SwitchSignInTarget } from "renderer/routes/_authenticated/settings/usage/components/UsageView/components/AddAccountDialog";
import { useForkCliOptions } from "renderer/stores/fork-cli-options";
import { useNewWorkspaceDraftStore } from "renderer/stores/new-workspace-draft";

export function useForkCreationAccount(
	hostUrl: string | null,
	agent: string,
	provider: string | null,
	model: string | null,
	resetKey: number,
	clientForHost = getHostServiceClientByUrl,
) {
	const showCliOptions = useForkCliOptions();
	const enabled = !!hostUrl && (provider === "claude" || provider === "codex");
	const quota = useHostUsageQuota(enabled ? hostUrl : null, clientForHost);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [adding, setAdding] = useState(false);
	const [reconnect, setReconnect] = useState<SwitchSignInTarget | null>(null);
	const options = useQuery({
		queryKey: ["fork-account-options", hostUrl, provider],
		enabled,
		queryFn: () =>
			hostUrl && provider
				? clientForHost(hostUrl).agents.accountOptions.query({
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
				? clientForHost(hostUrl).usage.launchAccount.query({
						agent,
						isolated: true,
					})
				: null,
		staleTime: 5 * 60_000,
		retry: false,
	});
	const stored = useNewWorkspaceDraftStore((state) => state.forkAccountChoice);
	const update = useNewWorkspaceDraftStore((state) => state.updateDraft);
	const key = `${hostUrl}:${provider}:${agent}:${resetKey}`;
	useEffect(() => {
		if (stored && stored.key !== key) update({ forkAccountChoice: undefined });
	}, [key, stored, update]);
	const rawSelection =
		!enabled || !metadata.data || metadata.data.environmentOverride
			? undefined
			: stored?.key === key
				? stored.selection
				: (metadata.data.defaultSelection ??
					quota.data?.find(
						(account) =>
							account.agent === provider &&
							account.isDefault &&
							account.selection !== null,
					)?.selection);
	const selection =
		!enabled || metadata.data?.environmentOverride
			? undefined
			: forkLaunchAccountSelection(
					rawSelection,
					options.data ?? [],
					showCliOptions,
				);
	const signature = `${key}:${selection}:${model}`;
	const live = useRef(signature);
	live.current = signature;
	useEffect(
		() => () => {
			live.current = "unmounted";
		},
		[],
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
		forcedApi: metadata.data?.environmentOverride ?? false,
		enabled,
		available: !!metadata.data,
		choose: (value: string | null) =>
			update({ forkAccountChoice: { key, selection: value } }),
		confirm: () => {
			if (
				enabled &&
				!showCliOptions &&
				!metadata.data?.environmentOverride &&
				typeof selection !== "string"
			) {
				setPickerOpen(true);
				return Promise.resolve(false);
			}
			return !enabled || !hostUrl
				? Promise.resolve(true)
				: validateAccountLaunch(
						{
							hostUrl,
							agent,
							provider: provider ?? "",
							selection,
							model: model ?? undefined,
							isCurrent: () => live.current === signature,
						},
						clientForHost,
					);
		},
	};
}
