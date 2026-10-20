import type { Turn } from "@superset/chat/protocol";
import {
	accountQuotaState,
	accountQuotaWindows,
} from "@superset/shared/fork-account-usage";
import type { UsageAccount } from "../trpc/router/usage/types";

// Claude SDK's synthetic usage-limit prefixes, accepted only on a failed
// session/prompt round trip, never from model output or a tool's stderr.
export function isClaudeQuotaFailure(message: string): boolean {
	return /^(?:session\/prompt: )?(?:Internal error: )?(?:You've (?:hit|reached) your .*(?:limit|usage)|You're out of (?:usage credits|extra usage)|Your org is out of usage)/.test(
		message,
	);
}

// When the limit hits mid-turn, the Claude ACP adapter ends the turn as
// completed and sends the notice as the last agent message. Only a message that
// is exactly that notice counts.
export function isClaudeQuotaMessage(text: string): boolean {
	return /^(?:You've (?:hit|reached) your [\w -]{0,40}limit(?: · resets [^\n]{1,60})?|You're out of (?:usage credits|extra usage)[^\n]{0,80}|Your org is out of usage[^\n]{0,80})$/.test(
		text.trim(),
	);
}

export function isAccountQuotaFailure(
	agent: string,
	error: Turn["error"],
): boolean {
	if (agent === "claude") return isClaudeQuotaFailure(error?.message ?? "");
	if (agent !== "codex") return false;
	if (error?.providerCode !== undefined)
		return error.providerCode === "usageLimitExceeded";
	return /^(?:session\/prompt: )?(?:Internal error: )?You['’]ve hit your usage limit(?:[., ]|$)/.test(
		error?.message ?? "",
	);
}

export function suggestedRecoveryAccount(
	accounts: UsageAccount[],
	current: string | null,
	model: string | undefined,
	blocked: Map<string, number>,
	now = Date.now(),
	agent: "claude" | "codex" = "claude",
) {
	const source = accounts.find(
		(a) =>
			a.agent === agent &&
			a.selection === current &&
			a.credentialKind === "subscription",
	);
	return accounts
		.filter(
			(a) =>
				a.agent === agent &&
				a.selection !== null &&
				a.selection !== current &&
				a.credentialKind === "subscription" &&
				(!source?.email || a.email !== source.email) &&
				(blocked.get(a.accountKey) ?? 0) <= now &&
				accountQuotaState(a, model, now).reason === "ready",
		)
		.sort(
			(a, b) =>
				(accountQuotaState(b, model, now).remaining ?? 0) -
				(accountQuotaState(a, model, now).remaining ?? 0),
		)[0];
}

export function recoveryResetAt(
	account: UsageAccount | undefined,
	now = Date.now(),
	model?: string,
) {
	const resets =
		(account ? accountQuotaWindows(account, model) : [])
			.filter(
				(w) => w.usedPercent >= 100 && w.resetsAt && w.resetsAt.getTime() > now,
			)
			.map((w) => w.resetsAt?.getTime() ?? now) ?? [];
	return resets.length ? Math.max(...resets) : now + 5 * 60_000;
}
