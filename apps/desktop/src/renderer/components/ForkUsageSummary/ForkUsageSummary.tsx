import { Trans } from "@lingui/react/macro";
import {
	formatCurrency,
	formatDate,
	formatNumber,
	formatPercent,
} from "@superset/i18n/format";
import { accountQuotaState } from "@superset/shared/fork-account-usage";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import { formatResetLabel } from "renderer/utils/usage/formatResetIn";

export function ForkUsageSummary({
	account,
	model,
	compact = false,
}: {
	account?: UsageAccount;
	model?: string;
	compact?: boolean;
}) {
	const state = accountQuotaState(account, model);
	const remaining =
		state.remaining === null
			? null
			: formatPercent(state.remaining / 100, { maximumFractionDigits: 1 });
	const status =
		state.reason === "api" ? (
			<Trans>API billing</Trans>
		) : state.reason === "exhausted" ? (
			<Trans>Quota exhausted</Trans>
		) : state.reason === "stale" ? (
			<Trans>Stale</Trans>
		) : state.reason === "unknown" ? (
			<Trans>Unverified</Trans>
		) : (
			<Trans>{remaining} available</Trans>
		);
	if (compact)
		return (
			<span
				className={`shrink-0 whitespace-nowrap ${state.warning ? "text-amber-500" : "text-muted-foreground"}`}
			>
				{status}
			</span>
		);
	const date = account
		? formatDate(account.fetchedAt, {
				month: "short",
				day: "numeric",
				hour: "numeric",
				minute: "2-digit",
			})
		: null;
	return (
		<div className="space-y-1 text-xs">
			<div
				className={`shrink-0 whitespace-nowrap ${state.warning ? "text-amber-500" : "text-muted-foreground"}`}
			>
				{status}
			</div>
			{account?.windows.map((window) => (
				<div
					key={window.id}
					className="flex flex-wrap justify-between gap-x-3 text-muted-foreground"
				>
					<span>
						{window.label} ·{" "}
						{formatPercent(window.usedPercent / 100, {
							maximumFractionDigits: 1,
						})}
					</span>
					<span>
						{window.resetsAt ? (
							formatResetLabel(window.resetsAt, new Date())
						) : (
							<Trans>Reset time unavailable</Trans>
						)}
					</span>
				</div>
			))}
			{account?.creditsBalance !== null &&
				account?.creditsBalance !== undefined && (
					<div>
						<Trans>Credits</Trans> · {formatNumber(account.creditsBalance)}
					</div>
				)}
			{account?.extraUsage && (
				<div>
					<Trans>Extra usage</Trans> ·{" "}
					{formatCurrency(account.extraUsage.usedCents / 100)} /{" "}
					{formatCurrency(account.extraUsage.limitCents / 100)}
				</div>
			)}
			{account && (
				<div className="text-[10px] text-muted-foreground">
					<Trans>Updated {date}</Trans>
				</div>
			)}
			{account?.retryAt && account.retryAt > new Date() && (
				<div className="text-amber-500">
					{formatResetLabel(account.retryAt, new Date())}
				</div>
			)}
		</div>
	);
}
