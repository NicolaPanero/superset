export const ACCOUNT_QUOTA_POLL_MS = 15_000;
export const ACCOUNT_QUOTA_CACHE_MS = 15_000;
export const ACCOUNT_QUOTA_PROVIDER_MS = 5 * 60_000;
// Allow a polling cycle and a bounded request before classifying a sample as old.
export const ACCOUNT_QUOTA_FRESH_MS = ACCOUNT_QUOTA_PROVIDER_MS + 60_000;
// Usage only moves when the account is used, so a sample stays on screen as
// current while its refreshes succeed; it reads as last known once they fail.
export const ACCOUNT_QUOTA_DISPLAY_MS = 30 * 60_000;
export const ACCOUNT_QUOTA_DISPLAY_MAX_MS = 6 * 60 * 60_000;
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

export function accountQuotaWindows(account: AccountQuota, model?: string) {
	const general = new Set(["five_hour", "seven_day", "primary", "secondary"]);
	return account.windows.filter((window) => {
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
}

/** A window past its reset time is a new, empty window. */
export function accountQuotaWithResets<T extends AccountQuota>(
	account: T,
	now = Date.now(),
): T {
	if (
		!account.windows.some(
			(window) => window.resetsAt && window.resetsAt.getTime() <= now,
		)
	)
		return account;
	return {
		...account,
		windows: account.windows.map((window) =>
			window.resetsAt && window.resetsAt.getTime() <= now
				? { ...window, usedPercent: 0, resetsAt: null }
				: window,
		),
	};
}

function displayStale(account: AccountQuota, now: number) {
	const age = now - account.fetchedAt.getTime();
	return (
		!Number.isFinite(age) ||
		age < 0 ||
		age >= ACCOUNT_QUOTA_DISPLAY_MAX_MS ||
		(account.status !== "ok" && age >= ACCOUNT_QUOTA_DISPLAY_MS)
	);
}

/**
 * `select` decides which account may run work: only a fresh sample counts.
 * `display` is what the rings and labels show: a known reset empties its
 * window, and an older sample stays current while its refreshes succeed.
 */
export function accountQuotaState(
	account: AccountQuota | undefined,
	model?: string,
	now = Date.now(),
	mode: "select" | "display" = "select",
) {
	if (!account)
		return { reason: "unknown" as const, remaining: null, warning: false };
	if (account.credentialKind === "api_key")
		return { reason: "api" as const, remaining: null, warning: true };
	const windows = accountQuotaWindows(
		mode === "display" ? accountQuotaWithResets(account, now) : account,
		model,
	);
	const stale =
		mode === "display"
			? displayStale(account, now)
			: account.status !== "ok" ||
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
	const reason =
		used === null
			? ("unknown" as const)
			: stale
				? ("stale" as const)
				: used >= 100
					? ("exhausted" as const)
					: ("ready" as const);
	return {
		reason,
		remaining: used === null ? null : Math.max(0, 100 - used),
		warning: used !== null && used > 90,
	};
}

export function accountQuotaRings(
	account: AccountQuota | undefined,
	model?: string,
	now = Date.now(),
) {
	const general = new Set(["five_hour", "seven_day", "primary", "secondary"]);
	const windows =
		account?.windows.filter((window) => general.has(window.id)) ?? [];
	const age = account ? now - account.fetchedAt.getTime() : Number.NaN;
	const hasSample =
		account &&
		account.status !== "signed_out" &&
		Number.isFinite(age) &&
		age >= 0 &&
		age < 24 * 60 * 60_000;
	let lastKnown = false;
	const used = (
		matches: (window: AccountQuota["windows"][number]) => boolean,
	) => {
		if (!hasSample) return null;
		const state = accountQuotaState(
			{ ...account, windows: windows.filter(matches) },
			model,
			now,
			"display",
		);
		if (state.remaining === null) return null;
		if (state.reason === "stale") lastKnown = true;
		return 100 - state.remaining;
	};
	const rings = {
		fiveHourUsed: used(
			(w) => w.id === "five_hour" || /^Session \(5h\)(?: ·|$)/.test(w.label),
		),
		weeklyUsed: used(
			(w) => w.id === "seven_day" || /^Weekly(?: ·|$)/.test(w.label),
		),
	};
	return { ...rings, ...(lastKnown ? { lastKnown: true } : {}) };
}
