import { accountQuotaState } from "@superset/shared/fork-account-usage";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";

const SIGNED_OUT = new Set<UsageAccount["status"]>([
	"signed_out",
	"token_expired",
]);

export function pickCatalogAccount(
	rows: UsageAccount[],
	provider: string,
): string | null {
	const ranked = rows
		.filter(
			(row) =>
				row.agent === provider &&
				row.selection !== null &&
				!SIGNED_OUT.has(row.status),
		)
		.map((row) => ({
			selection: row.selection,
			isDefault: row.isDefault,
			quota: accountQuotaState(row),
		}))
		.sort(
			(a, b) =>
				Number(b.isDefault) - Number(a.isDefault) ||
				Number(b.quota.reason === "ready") -
					Number(a.quota.reason === "ready") ||
				(b.quota.remaining ?? 0) - (a.quota.remaining ?? 0),
		);
	return ranked[0]?.selection ?? null;
}
