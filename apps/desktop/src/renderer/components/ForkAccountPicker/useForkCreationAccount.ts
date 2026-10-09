import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useHostUsageQuota } from "renderer/hooks/host-service/useHostUsageQuota";
import { validateAccountLaunch } from "renderer/lib/fork-account-launch";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useNewWorkspaceDraftStore } from "renderer/stores/new-workspace-draft";

export function useForkCreationAccount(
	hostUrl: string | null,
	agent: string,
	provider: string | null,
	model: string | null,
	resetKey: number,
) {
	const enabled = !!hostUrl && (provider === "claude" || provider === "codex");
	const quota = useHostUsageQuota(enabled ? hostUrl : null);
	const [pickerOpen, setPickerOpen] = useState(false);
	const options = useQuery({
		queryKey: ["fork-account-options", hostUrl, provider],
		enabled,
		queryFn: () =>
			hostUrl && provider
				? getHostServiceClientByUrl(hostUrl).agents.accountOptions.query({
						agent: provider,
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
					})
				: null,
		staleTime: 5 * 60_000,
		retry: false,
	});
	const stored = useNewWorkspaceDraftStore((state) => state.forkAccountChoice);
	const update = useNewWorkspaceDraftStore((state) => state.updateDraft);
	const key = `${hostUrl}:${provider}:${agent}:${resetKey}`;
	const selection =
		!enabled || !metadata.data || metadata.data.environmentOverride
			? undefined
			: stored?.key === key
				? stored.selection
				: quota.data?.find(
						(account) => account.agent === provider && account.isDefault,
					)?.selection;
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
		quota,
		options,
		selection,
		forcedApi: metadata.data?.environmentOverride ?? false,
		enabled,
		available: !!metadata.data,
		choose: (value: string | null) =>
			update({ forkAccountChoice: { key, selection: value } }),
		confirm: () =>
			!enabled || !hostUrl
				? Promise.resolve(true)
				: validateAccountLaunch({
						hostUrl,
						agent,
						provider: provider ?? "",
						selection,
						model: model ?? undefined,
						isCurrent: () => live.current === signature,
					}),
	};
}
