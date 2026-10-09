export const ACCOUNT_QUOTA_FRESH_MS = 5 * 60_000;
export interface AccountQuota {
	agent: string;
	credentialKind: string;
	status: string;
	fetchedAt: Date;
	windows: Array<{
		id: string;
		label: string;
		usedPercent: number;
		resetsAt: Date | null;
	}>;
}

export function accountQuotaState(
	account: AccountQuota | undefined,
	model?: string,
	now = Date.now(),
) {
	if (!account)
		return { reason: "unknown" as const, remaining: null, warning: false };
	if (account.credentialKind === "api_key")
		return { reason: "api" as const, remaining: null, warning: true };
	const general = new Set(["five_hour", "seven_day", "primary", "secondary"]);
	const windows = account.windows.filter((window) => {
		if (general.has(window.id)) return true;
		if (!model) return true;
		const name = `${window.id} ${window.label}`.toLowerCase();
		const chosen = model.toLowerCase();
		return (
			["sonnet", "opus", "haiku", "spark", "gpt-5"].some(
				(key) => chosen.includes(key) && name.includes(key),
			) || name.includes(chosen)
		);
	});
	const stale =
		account.status !== "ok" ||
		!Number.isFinite(account.fetchedAt.getTime()) ||
		now - account.fetchedAt.getTime() >= ACCOUNT_QUOTA_FRESH_MS ||
		now < account.fetchedAt.getTime() ||
		windows.some(
			(window) => window.resetsAt && window.resetsAt.getTime() <= now,
		);
	const usable = windows.every(
		(window) => Number.isFinite(window.usedPercent) && window.usedPercent >= 0,
	);
	const used =
		usable && windows.length
			? Math.max(...windows.map((window) => window.usedPercent))
			: null;
	const reason = stale
		? ("stale" as const)
		: used === null
			? ("unknown" as const)
			: used >= 100
				? ("exhausted" as const)
				: ("ready" as const);
	return {
		reason,
		remaining: used === null ? null : Math.max(0, 100 - used),
		warning: used !== null && used > 90,
	};
}
