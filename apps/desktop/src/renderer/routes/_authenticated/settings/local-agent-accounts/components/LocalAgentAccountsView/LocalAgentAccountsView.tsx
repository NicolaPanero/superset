import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { LuEye, LuEyeOff, LuPlus, LuRefreshCw } from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { ForkExternalAccount } from "renderer/components/ForkExternalAccount";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import { useHostUsageQuota } from "renderer/hooks/host-service/useHostUsageQuota";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useAccountRename } from "renderer/routes/_authenticated/settings/usage/components/UsageView/components/AccountRenameDialog";
import type { SwitchSignInTarget } from "renderer/routes/_authenticated/settings/usage/components/UsageView/components/AddAccountDialog";
import { AddAccountDialog } from "renderer/routes/_authenticated/settings/usage/components/UsageView/components/AddAccountDialog";
import { RemoveAccountDialog } from "renderer/routes/_authenticated/settings/usage/components/UsageView/components/RemoveAccountDialog";
import type { RestartSessionsPrompt } from "renderer/routes/_authenticated/settings/usage/components/UsageView/components/RestartSessionsDialog";
import { RestartSessionsDialog } from "renderer/routes/_authenticated/settings/usage/components/UsageView/components/RestartSessionsDialog";
import type { ManagedAgent } from "renderer/routes/_authenticated/settings/usage/components/UsageView/utils/visibleQuotaAgents";
import { isManagedAgent } from "renderer/routes/_authenticated/settings/usage/components/UsageView/utils/visibleQuotaAgents";
import { useRemoveUsageAccount } from "renderer/routes/_authenticated/settings/usage/hooks/useRemoveUsageAccount";
import { useRestartAgentSessions } from "renderer/routes/_authenticated/settings/usage/hooks/useRestartAgentSessions";
import { useSetDefaultUsageAccount } from "renderer/routes/_authenticated/settings/usage/hooks/useSetDefaultUsageAccount";
import { useForkCliOptions } from "renderer/stores/fork-cli-options";
import { LocalAgentConnection } from "../LocalAgentConnection";
import { OpenCodeConnection } from "../OpenCodeConnection";
import { AccountCard } from "./components/AccountCard";
import { AGENT_LABELS } from "./constants";
import { localAccountSections } from "./utils/localAccountSections";

export function LocalAgentAccountsView({
	hostUrl,
	focusedAccountKey,
	focusedAgent,
}: {
	hostUrl: string | null;
	focusedAccountKey?: string;
	focusedAgent?: string;
}) {
	const focusRef = useRef<HTMLDivElement>(null);
	const focusedOnce = useRef<string | null>(null);
	const { t } = useLingui();
	const queryClient = useQueryClient();
	const quotaQuery = useHostUsageQuota(hostUrl);
	const configsQuery = useV2AgentConfigs(hostUrl);
	const { activeHostUrl } = useLocalHostService();
	const rename = useAccountRename(hostUrl);
	const setDefault = useSetDefaultUsageAccount(hostUrl);
	const removeAccount = useRemoveUsageAccount(hostUrl);
	const isDark = useIsDarkTheme();
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [hideEmails, setHideEmails] = useState(false);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [dialogAgent, setDialogAgent] = useState<ManagedAgent>("claude");
	const [switchTarget, setSwitchTarget] = useState<SwitchSignInTarget | null>(
		null,
	);
	const [removeTarget, setRemoveTarget] = useState<UsageAccount | null>(null);
	const [restartPrompt, setRestartPrompt] =
		useState<RestartSessionsPrompt | null>(null);
	const { countRestartCandidates, restartMutation } =
		useRestartAgentSessions(hostUrl);

	const showCliOptions = useForkCliOptions();
	const accounts = (quotaQuery.data ?? []).filter(
		(account) =>
			showCliOptions ||
			!isManagedAgent(account.agent) ||
			account.selection !== null,
	);
	useEffect(() => {
		if (!quotaQuery.data && !configsQuery.data) return;
		const key = `${hostUrl}:${focusedAgent}:${focusedAccountKey}`;
		if (focusedOnce.current !== key && focusRef.current) {
			focusRef.current.scrollIntoView({ block: "center" });
			focusRef.current.focus({ preventScroll: true });
			focusedOnce.current = key;
		}
	}, [
		hostUrl,
		focusedAgent,
		focusedAccountKey,
		quotaQuery.data,
		configsQuery.data,
	]);
	const isBusy = quotaQuery.isFetching || isRefreshing;

	const showMadeDefaultToast = (
		providerLabel: string,
		accountLabel: string,
	) => {
		toast.success(
			t({
				message: `New ${providerLabel} agents will use ${accountLabel}.`,
			}),
			{
				description: t({
					message: "Relaunch running agents to switch them.",
				}),
			},
		);
	};

	// Running agents keep the previous account (their PTY env froze at
	// spawn) — after a switch, offer to restart them onto the new one. When
	// the host can't be asked, fall back to the plain toast.
	const handleDefaultSwitched = async (
		agent: ManagedAgent,
		accountLabel: string,
	) => {
		const providerLabel = AGENT_LABELS[agent];
		let candidateCount = 0;
		try {
			candidateCount = await countRestartCandidates(agent);
		} catch {
			// Fall through to the plain toast.
		}
		if (candidateCount > 0) {
			setRestartPrompt({
				agent,
				providerLabel,
				accountLabel,
				count: candidateCount,
			});
			return;
		}
		showMadeDefaultToast(providerLabel, accountLabel);
	};

	const makeDefaultAccount = (account: UsageAccount) => {
		if (!isManagedAgent(account.agent)) return;
		const agent = account.agent;
		setDefault.mutate(
			{ agent, selection: account.selection },
			{
				onSuccess: () => {
					void handleDefaultSwitched(
						agent,
						account.email ?? account.sourceLabel,
					);
				},
				onError: (error) => toast.error(errorMessage(error)),
			},
		);
	};

	const declineRestartSessions = () => {
		if (!restartPrompt) return;
		const { providerLabel, accountLabel } = restartPrompt;
		setRestartPrompt(null);
		showMadeDefaultToast(providerLabel, accountLabel);
	};

	const confirmRestartSessions = () => {
		if (!restartPrompt) return;
		const { agent, accountLabel } = restartPrompt;
		setRestartPrompt(null);
		restartMutation.mutate(
			{ agent },
			{
				onSuccess: () => {
					toast.success(
						t({
							message: `Restarting agents on ${accountLabel}.`,
						}),
						{
							description: t({
								message: "Each session resumes where it left off.",
							}),
						},
					);
				},
				onError: (error) => toast.error(errorMessage(error)),
			},
		);
	};

	const openAddAgentAccount = (agent: ManagedAgent) => {
		setDialogAgent(agent);
		setSwitchTarget(null);
		setIsDialogOpen(true);
	};

	const openSwitchSignIn = (account: UsageAccount) => {
		if (!isManagedAgent(account.agent)) return;
		setDialogAgent(account.agent);
		setSwitchTarget({
			agent: account.agent,
			credentialKind: account.credentialKind,
			selection: account.selection,
			label:
				account.selection === null
					? (account.email ?? account.sourceLabel)
					: account.sourceLabel,
		});
		setIsDialogOpen(true);
	};

	return (
		<div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-3 px-6 py-4">
			<div className="flex items-center gap-2">
				<span className="ml-auto text-[10px] text-muted-foreground">
					<Trans>Official quota · refreshes every 5 min</Trans>
				</span>
				<Button
					variant="ghost"
					size="sm"
					className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground"
					aria-pressed={hideEmails}
					onClick={() => setHideEmails((hidden) => !hidden)}
				>
					{hideEmails ? (
						<LuEye className="size-3" />
					) : (
						<LuEyeOff className="size-3" />
					)}
					{hideEmails ? <Trans>Show emails</Trans> : <Trans>Hide emails</Trans>}
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="size-6"
					disabled={isBusy || !hostUrl}
					onClick={() => {
						setIsRefreshing(true);
						void Promise.all([
							quotaQuery.refresh(),
							configsQuery.refetch(),
							queryClient.invalidateQueries({
								queryKey: ["fork-agent-setup", hostUrl],
							}),
						])
							// A failed refresh keeps the last good data; the next poll retries.
							.catch(() => {})
							.finally(() => setIsRefreshing(false));
					}}
				>
					<LuRefreshCw className={cn("size-3", isBusy && "animate-spin")} />
				</Button>
			</div>

			{/* Sections render before the first quota read lands so Add account is
			    reachable straight away; each shows its own placeholder meanwhile. */}
			{localAccountSections(accounts, configsQuery.data ?? []).map((agent) => {
				const agentAccounts = accounts
					.filter((account) => account.agent === agent)
					.toSorted(
						(a, b) =>
							Number(a.selection === null) - Number(b.selection === null),
					);
				const icon = getPresetIcon(agent, isDark);
				return (
					<section
						key={agent}
						ref={
							!focusedAccountKey && agent === focusedAgent
								? focusRef
								: undefined
						}
						tabIndex={-1}
						className="flex flex-col gap-1.5 outline-none"
					>
						<div className="flex items-center gap-1.5">
							{icon && <img src={icon} alt="" className="size-3.5" />}
							<span className="text-xs font-medium">{AGENT_LABELS[agent]}</span>
							{isManagedAgent(agent) && (
								<Button
									variant="ghost"
									size="sm"
									className="ml-auto h-5 gap-1 px-1.5 text-[10px] text-muted-foreground"
									disabled={!hostUrl}
									onClick={() => openAddAgentAccount(agent)}
								>
									<LuPlus className="size-3" />
									<Trans>Add account</Trans>
								</Button>
							)}
						</div>
						{(configsQuery.data ?? [])
							.filter(
								(config) =>
									config.presetId === agent &&
									(agent === "grok" || agent === "cursor-agent"),
							)
							.map((config) => (
								<LocalAgentConnection
									key={`${hostUrl}:${config.id}`}
									config={config}
									hostUrl={hostUrl}
								/>
							))}
						{agent === "opencode" &&
							(configsQuery.data ?? [])
								.filter((config) => config.presetId === agent)
								.map((config) => (
									<OpenCodeConnection
										allowLocalLogin={hostUrl === activeHostUrl}
										key={`${hostUrl}:${config.id}`}
										config={config}
										hostUrl={hostUrl}
										onChanged={() => quotaQuery.refresh()}
									/>
								))}
						{agent === "cursor-agent" ||
						(agentAccounts.length === 0 &&
							(agent === "grok" ||
								agent === "opencode")) ? null : quotaQuery.isPending ? (
							<div className="flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
								<LuRefreshCw className="size-3 animate-spin" />
								<Trans>Reading usage…</Trans>
							</div>
						) : agentAccounts.length === 0 ? (
							<div className="rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
								<Trans>
									No {AGENT_LABELS[agent]} logins on this host — sign in and
									usage appears here.
								</Trans>
							</div>
						) : (
							<div className="grid gap-2 md:grid-cols-2">
								{agentAccounts.map((account) => (
									<div
										key={account.accountKey}
										ref={
											account.accountKey === focusedAccountKey &&
											(!focusedAgent || account.agent === focusedAgent)
												? focusRef
												: undefined
										}
										tabIndex={-1}
										className={cn(
											"rounded-lg outline-none",
											account.accountKey === focusedAccountKey &&
												(!focusedAgent || account.agent === focusedAgent) &&
												"ring-2 ring-ring ring-offset-2 ring-offset-background",
										)}
									>
										<ForkExternalAccount
											external={
												isManagedAgent(account.agent) &&
												account.selection === null
											}
										>
											<AccountCard
												hostUrl={hostUrl}
												account={account}
												onMakeDefault={
													isManagedAgent(account.agent) &&
													account.selection !== null
														? () => makeDefaultAccount(account)
														: null
												}
												onSwitchSignIn={
													isManagedAgent(account.agent)
														? () => openSwitchSignIn(account)
														: null
												}
												onRemove={
													isManagedAgent(account.agent) &&
													account.selection !== null
														? () => setRemoveTarget(account)
														: null
												}
												isSwitching={setDefault.isPending}
												selectable={
													isManagedAgent(agent) &&
													account.selection !== null &&
													agentAccounts.filter((row) => row.selection !== null)
														.length > 1
												}
												hideEmails={hideEmails}
												alias={rename.aliasFor(account)}
												onRename={rename.onRename(account)}
											/>
										</ForkExternalAccount>
									</div>
								))}
							</div>
						)}
					</section>
				);
			})}

			<RemoveAccountDialog
				account={removeTarget}
				onOpenChange={(open) => {
					if (!open) setRemoveTarget(null);
				}}
				isRemoving={removeAccount.isPending}
				onConfirm={() => {
					if (
						!removeTarget ||
						removeTarget.selection === null ||
						!isManagedAgent(removeTarget.agent)
					)
						return;
					removeAccount.mutate(
						{
							agent: removeTarget.agent,
							selection: removeTarget.selection,
						},
						{
							onSuccess: () => {
								const removedLabel =
									removeTarget.email ?? removeTarget.sourceLabel;
								toast.success(
									t({
										message: `Removed ${removedLabel}.`,
									}),
								);
								setRemoveTarget(null);
							},
							onError: (error) => toast.error(errorMessage(error)),
						},
					);
				}}
			/>

			<RestartSessionsDialog
				prompt={restartPrompt}
				onDecline={declineRestartSessions}
				onConfirm={confirmRestartSessions}
			/>

			<AddAccountDialog
				open={isDialogOpen}
				onOpenChange={(open) => {
					setIsDialogOpen(open);
					if (!open) setSwitchTarget(null);
				}}
				agent={dialogAgent}
				switchTarget={switchTarget}
				hostUrl={hostUrl}
				onDefaultSwitched={(agent, accountLabel) => {
					void handleDefaultSwitched(agent, accountLabel);
				}}
				onAccountAdded={() => {
					setIsRefreshing(true);
					void quotaQuery
						.refresh()
						.catch(() => {})
						.finally(() => setIsRefreshing(false));
				}}
			/>

			{rename.dialog}
		</div>
	);
}
