import { Trans } from "@lingui/react/macro";
import {
	formatCurrency,
	formatDate,
	formatNumber,
} from "@superset/i18n/format";
import {
	accountQuotaState,
	accountQuotaWindows,
} from "@superset/shared/fork-account-usage";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import { formatResetLabel } from "renderer/utils/usage/formatResetIn";
import { UsageWindowChip } from "./components/UsageWindowChip";
import { UsageWindowRow } from "./components/UsageWindowRow";

const GENERAL_WINDOW_IDS = new Set([
	"five_hour",
	"seven_day",
	"primary",
	"secondary",
]);
const COMPACT_WINDOW_LIMIT = 2;

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
	const status =
		account?.status === "signed_out" ? (
			<Trans>Signed out</Trans>
		) : state.reason === "api" ? (
			<Trans>API billing</Trans>
		) : state.reason === "exhausted" ? (
			<Trans>Quota exhausted</Trans>
		) : state.reason === "stale" ? (
			<Trans>Last known</Trans>
		) : state.reason === "unknown" ? (
			<Trans>Unverified</Trans>
		) : null;
	const statusClass = state.warning ? "text-warning" : "text-muted-foreground";
	const showsWindows =
		!!account &&
		account.status !== "signed_out" &&
		state.reason !== "api" &&
		state.reason !== "unknown";
	const dimmed = state.reason === "stale";
	if (compact) {
		const modelWindows = account ? accountQuotaWindows(account, model) : [];
		const general = modelWindows.filter((window) =>
			GENERAL_WINDOW_IDS.has(window.id),
		);
		const chips = (general.length ? general : modelWindows).slice(
			0,
			COMPACT_WINDOW_LIMIT,
		);
		return (
			<span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-xs">
				{status && <span className={statusClass}>{status}</span>}
				{showsWindows &&
					chips.map((window) => (
						<UsageWindowChip key={window.id} window={window} dimmed={dimmed} />
					))}
			</span>
		);
	}
	const date = account
		? formatDate(account.fetchedAt, {
				month: "short",
				day: "numeric",
				hour: "numeric",
				minute: "2-digit",
			})
		: null;
	return (
		<div className="space-y-2 text-xs">
			{status && (
				<div className={`shrink-0 whitespace-nowrap ${statusClass}`}>
					{status}
				</div>
			)}
			{showsWindows &&
				account?.windows.map((window) => (
					<UsageWindowRow key={window.id} window={window} dimmed={dimmed} />
				))}
			{account?.creditsBalance !== null &&
				account?.creditsBalance !== undefined && (
					<div className="text-muted-foreground">
						<Trans>Credits</Trans> · {formatNumber(account.creditsBalance)}
					</div>
				)}
			{account?.extraUsage && (
				<div className="text-muted-foreground">
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
				<div className="text-warning">
					{formatResetLabel(account.retryAt, new Date())}
				</div>
			)}
		</div>
	);
}
