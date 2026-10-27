import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { formatDate } from "@superset/i18n/format";
import { ACCOUNT_QUOTA_PROVIDER_MS } from "@superset/shared/fork-account-usage";
import {
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { LuCheck, LuPlus, LuRefreshCw, LuSettings2 } from "react-icons/lu";
import { forkAccountLabel } from "renderer/lib/fork-account-label";
import { ForkUsageStatus } from "../../../ForkUsageStatus";
import { ForkUsageSummary } from "../../../ForkUsageSummary";
import { useForkAccountChoices } from "../../useForkAccountChoices";
import type { useForkCreationAccount } from "../../useForkCreationAccount";
import {
	forkReconnectTarget,
	needsReconnect,
} from "./utils/forkReconnectTarget";

export function ForkAccountMenuItems({
	account,
	provider,
	model,
	afterClose,
	extraItems,
	hidden,
}: {
	account: ReturnType<typeof useForkCreationAccount>;
	provider: string | null;
	model?: string;
	afterClose: (action: () => void) => void;
	extraItems?: ReactNode;
	/** An account not to offer, such as the one a chat already uses. */
	hidden?: string | null;
}) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const [refreshing, setRefreshing] = useState(false);
	const { choices, selected, suggested } = useForkAccountChoices(
		account,
		provider,
		model,
		hidden,
	);
	const canSignIn = provider === "claude" || provider === "codex";
	const newest = Math.max(
		0,
		...choices.map(({ usage }) => usage?.fetchedAt.getTime() ?? 0),
	);
	const date = newest
		? formatDate(new Date(newest), { hour: "numeric", minute: "2-digit" })
		: null;
	return (
		<>
			<DropdownMenuLabel>
				<Trans>Account</Trans>
			</DropdownMenuLabel>
			<p className="px-2 pb-2 text-[11px] text-muted-foreground">
				<Trans>Quota used: outer ring 5h, inner ring weekly.</Trans>
			</p>
			{account.options.isSuccess && choices.length === 0 && (
				<p className="px-2 py-2 text-xs text-muted-foreground">
					<Trans>Add an account to start chatting.</Trans>
				</p>
			)}
			{choices.map(({ option, usage }) => {
				const chosen = account.selection === option.selection;
				return (
					<div key={option.selection ?? "system"}>
						{option.selection === null && <DropdownMenuSeparator />}
						<DropdownMenuItem
							onSelect={() => {
								const target =
									canSignIn && needsReconnect(usage)
										? forkReconnectTarget(provider, option, usage)
										: null;
								if (target) afterClose(() => account.setReconnect(target));
								else afterClose(() => account.choose(option.selection));
							}}
							className="grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-2 gap-y-1 py-1.5"
						>
							<LuCheck
								className={cn(
									"mt-0.5 size-3.5",
									chosen ? "text-foreground" : "invisible",
								)}
							/>
							<div className="flex min-w-0 items-center gap-1.5">
								<span className="truncate font-medium">
									{forkAccountLabel(option, usage?.email)}
								</span>
								{usage?.isDefault && (
									<span className="shrink-0 rounded border px-1 text-[10px] text-muted-foreground">
										<Trans>Default</Trans>
									</span>
								)}
								<ForkUsageStatus account={usage} model={model} chip />
								{suggested?.option.selection === option.selection && (
									<span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
										<Trans>Suggested</Trans>
									</span>
								)}
							</div>
							<div className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-2">
								<ForkUsageSummary
									account={usage}
									model={model}
									compact
									hideStatus
								/>
								{(usage?.status === "signed_out" ||
									usage?.status === "token_expired") && (
									<span className="text-xs text-warning">
										<Trans>Reconnect account</Trans>
									</span>
								)}
							</div>
						</DropdownMenuItem>
					</div>
				);
			})}
			<DropdownMenuSeparator />
			{extraItems && (
				<>
					{extraItems}
					<DropdownMenuSeparator />
				</>
			)}
			{selected?.usage &&
				(selected.usage.status === "signed_out" ||
					selected.usage.status === "token_expired" ||
					selected.usage.status === "token_stale") &&
				canSignIn && (
					<DropdownMenuItem
						onSelect={() =>
							afterClose(() =>
								account.setReconnect(
									forkReconnectTarget(
										provider,
										selected.option,
										selected.usage,
									),
								),
							)
						}
					>
						<Trans>Reconnect account</Trans>
					</DropdownMenuItem>
				)}
			{canSignIn && (
				<DropdownMenuItem
					onSelect={() => afterClose(() => account.setAdding(true))}
				>
					<LuPlus className="size-3.5 shrink-0 text-muted-foreground" />
					<Trans>Add account</Trans>
				</DropdownMenuItem>
			)}
			<DropdownMenuItem
				disabled={refreshing}
				onSelect={(event) => {
					event.preventDefault();
					const startedAt = Date.now();
					setRefreshing(true);
					void account.quota
						.refresh()
						.then((rows) => {
							const checked = (rows ?? []).filter(
								(row) => row.agent === provider && row.status !== "signed_out",
							);
							const latest = Math.max(
								0,
								...checked.map((row) => row.fetchedAt.getTime()),
							);
							if (checked.length === 0 || latest >= startedAt) return;
							const nextAt = latest + ACCOUNT_QUOTA_PROVIDER_MS;
							if (nextAt > Date.now()) {
								const next = formatDate(new Date(nextAt), {
									hour: "numeric",
									minute: "2-digit",
								});
								toast.info(
									t({
										message: `Usage is read at most every 5 minutes per account. Next update at ${next}.`,
									}),
								);
							} else
								toast.warning(
									t({
										message:
											"The provider returned no new usage. The last known values are shown.",
									}),
								);
						})
						.catch((error) => toast.error(errorMessage(error)))
						.finally(() => setRefreshing(false));
				}}
			>
				<LuRefreshCw
					className={cn(
						"size-3.5 shrink-0 text-muted-foreground",
						refreshing && "animate-spin",
					)}
				/>
				{refreshing ? <Trans>Refreshing…</Trans> : <Trans>Refresh</Trans>}
				{date && (
					<span className="ml-auto text-[10px] text-muted-foreground">
						<Trans>Updated {date}</Trans>
					</span>
				)}
			</DropdownMenuItem>
			<DropdownMenuItem
				onSelect={() =>
					void navigate({
						to: "/settings/local-agent-accounts",
						search: provider ? { agent: provider } : {},
					})
				}
			>
				<LuSettings2 className="size-3.5 shrink-0 text-muted-foreground" />
				<Trans>Manage accounts…</Trans>
			</DropdownMenuItem>
		</>
	);
}
