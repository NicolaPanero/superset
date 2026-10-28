import { Trans } from "@lingui/react/macro";
import { accountQuotaState } from "@superset/shared/fork-account-usage";
import { cn } from "@superset/ui/utils";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";

export function ForkUsageStatus({
	account,
	model,
	chip = false,
}: {
	account?: UsageAccount;
	model?: string;
	chip?: boolean;
}) {
	const state = accountQuotaState(account, model, undefined, "display");
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
	if (!status) return null;
	return (
		<span
			className={cn(
				"shrink-0 whitespace-nowrap",
				state.warning ? "text-warning" : "text-muted-foreground",
				chip &&
					cn(
						"rounded px-1 text-[10px]",
						state.warning ? "bg-warning/10" : "bg-muted",
					),
			)}
		>
			{status}
		</span>
	);
}
