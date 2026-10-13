import { Trans, useLingui } from "@lingui/react/macro";
import { getAgentModelSupport } from "@superset/shared/agent-models";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { AgentModelSelect } from "renderer/components/AgentModelSelect";
import { AgentSelect } from "renderer/components/AgentSelect";
import { ForkAccountEmptyState } from "renderer/components/ForkAccountEmptyState";
import { ForkUsageSummary } from "renderer/components/ForkUsageSummary";
import { useHostUsageQuota } from "renderer/hooks/host-service/useHostUsageQuota";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { forkAccountLabel } from "renderer/lib/fork-account-label";
import {
	forkLaunchAccountSelection,
	visibleForkAccountOptions,
} from "renderer/lib/fork-account-visibility";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useForkCliOptions } from "renderer/stores/fork-cli-options";
import type { CreateNewAgentSession } from "../../hooks/useAgentSessionLauncher";

const CONFIGURED_ACCOUNT = "__configured_account__";
const SYSTEM_ACCOUNT = "__system_account__";

export function ForkNewAgentDialog({
	open,
	onOpenChange,
	workspaceId,
	workspaceName,
	onCreateNewAgentSession,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workspaceId: string;
	workspaceName: string;
	onCreateNewAgentSession: CreateNewAgentSession;
}) {
	const { t } = useLingui();
	const showCliOptions = useForkCliOptions();
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const [configId, setConfigId] = useState<string>();
	const [model, setModel] = useState<string | null>(null);
	const [account, setAccount] = useState(CONFIGURED_ACCOUNT);
	const [busy, setBusy] = useState(false);
	const launchLock = useRef(false);
	const configs = useV2AgentConfigs(hostUrl);
	const peers = configs.data ?? [];
	const selected = peers.find(
		(config) => config.id === (configId ?? peers[0]?.id),
	);
	const models = selected
		? (getAgentModelSupport(selected.presetId)?.models ?? [])
		: [];
	const managed =
		selected?.presetId === "claude" || selected?.presetId === "codex";
	const quota = useHostUsageQuota(open && managed ? hostUrl : null);
	const options = useQuery({
		queryKey: ["agent-launch-account-options", hostUrl, selected?.presetId],
		enabled: open && managed && !!hostUrl,
		queryFn: () =>
			hostUrl && selected
				? getHostServiceClientByUrl(hostUrl).agents.accountOptions.query({
						agent: selected.presetId,
						isolated: true,
					})
				: [],
		retry: false,
		staleTime: 30_000,
	});
	const metadata = useQuery({
		queryKey: ["fork-launch-account", hostUrl, selected?.id],
		enabled: open && managed && !!hostUrl && !!selected,
		queryFn: () =>
			hostUrl && selected
				? getHostServiceClientByUrl(hostUrl).usage.launchAccount.query({
						agent: selected.id,
						isolated: true,
					})
				: null,
		retry: false,
		staleTime: 30_000,
	});
	const choices = visibleForkAccountOptions(options.data ?? [], showCliOptions);
	const defaultUsage = quota.data?.find(
		(row) =>
			row.agent === selected?.presetId &&
			row.isDefault &&
			(showCliOptions || row.selection !== null),
	);
	const defaultOption = options.data?.find(
		(option) => option.selection === defaultUsage?.selection,
	);
	const defaultLabel = defaultOption?.alias ?? defaultUsage?.email;
	const selection = forkLaunchAccountSelection(
		account === CONFIGURED_ACCOUNT
			? (metadata.data?.defaultSelection ?? defaultUsage?.selection)
			: account === SYSTEM_ACCOUNT
				? null
				: account,
		choices,
		showCliOptions,
	);
	const accountMissing =
		managed &&
		!showCliOptions &&
		!metadata.data?.environmentOverride &&
		typeof selection !== "string";
	const selectConfig = (id: string) => {
		setConfigId(id);
		setModel(null);
		setAccount(CONFIGURED_ACCOUNT);
	};
	const launchSession = async () => {
		if (!selected || accountMissing || launchLock.current) return;
		launchLock.current = true;
		setBusy(true);
		try {
			const result = await onCreateNewAgentSession({
				configId: selected.id,
				placement: "new-tab",
				prompt: "",

				...(model ? { modelId: model } : {}),
				...(managed &&
				!metadata.data?.environmentOverride &&
				selection !== undefined
					? { accountSelection: selection }
					: {}),
			});
			if (result) onOpenChange(false);
		} finally {
			launchLock.current = false;
			setBusy(false);
		}
	};
	return (
		<Dialog
			open={open}
			onOpenChange={(value) => {
				if (!busy) onOpenChange(value);
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						<Trans>New agent</Trans>
					</DialogTitle>
					<DialogDescription>{workspaceName}</DialogDescription>
				</DialogHeader>
				<div className="space-y-2">
					<p className="text-sm">
						<Trans>Agent</Trans>
					</p>
					<AgentSelect
						agents={peers.map((config) => ({
							id: config.id,
							label: config.label,
							iconId: config.iconId ?? config.presetId,
						}))}
						value={selected?.id}
						placeholder={t({ message: "Select agent" })}
						onValueChange={selectConfig}
						disabled={busy}
						onBeforeConfigureAgents={() => onOpenChange(false)}
					/>
				</div>
				{managed && (
					<div className="space-y-2">
						<p className="text-sm">
							<Trans>Account</Trans>
						</p>
						<Select
							value={
								showCliOptions
									? account === CONFIGURED_ACCOUNT && defaultUsage?.selection
										? defaultUsage.selection
										: account
									: (selection ?? "")
							}
							onValueChange={setAccount}
							disabled={busy || !options.isSuccess}
						>
							<SelectTrigger aria-label={t({ message: "Account" })}>
								<SelectValue
									placeholder={t({ message: "Choose an account" })}
								/>
							</SelectTrigger>
							<SelectContent>
								{showCliOptions && !defaultUsage?.selection && (
									<SelectItem value={CONFIGURED_ACCOUNT}>
										{defaultLabel ? (
											<>
												{defaultLabel} · <Trans>Default</Trans>
											</>
										) : (
											<Trans>Configured account</Trans>
										)}
									</SelectItem>
								)}
								{choices.map((option) => {
									const usage = quota.data?.find(
										(row) =>
											row.agent === selected?.presetId &&
											row.selection === option.selection,
									);
									const label = forkAccountLabel(option, usage?.email);
									return (
										<div key={option.selection ?? SYSTEM_ACCOUNT}>
											{option.selection === null && <SelectSeparator />}
											<SelectItem
												key={option.selection ?? SYSTEM_ACCOUNT}
												value={option.selection ?? SYSTEM_ACCOUNT}
											>
												{label}
												<span className="ml-2">
													<ForkUsageSummary
														compact
														account={usage}
														model={model ?? undefined}
													/>
												</span>
											</SelectItem>
										</div>
									);
								})}
							</SelectContent>
						</Select>
						{options.isSuccess && accountMissing && selected && (
							<ForkAccountEmptyState
								hostUrl={hostUrl}
								agent={selected.presetId as "claude" | "codex"}
								onAccountAdded={() => {
									void options.refetch();
									void quota.refetch();
									void metadata.refetch();
								}}
							/>
						)}
					</div>
				)}
				{models.length > 0 && (
					<div className="space-y-2">
						<p className="text-sm">
							<Trans>Model</Trans>
						</p>
						<AgentModelSelect
							models={models}
							value={model}
							onValueChange={setModel}
							defaultLabel={t({ message: "CLI default" })}
							disabled={busy}
						/>
					</div>
				)}
				<div className="space-y-2">
					<p className="text-sm">
						<Trans>Workspace</Trans>
					</p>
					<p className="rounded-md border p-2 text-sm">{workspaceName}</p>
				</div>
				<Button
					onClick={() => void launchSession()}
					disabled={
						busy ||
						!selected ||
						accountMissing ||
						(managed && !options.isSuccess)
					}
				>
					{busy ? <Trans>Starting…</Trans> : <Trans>Start</Trans>}
				</Button>
			</DialogContent>
		</Dialog>
	);
}
