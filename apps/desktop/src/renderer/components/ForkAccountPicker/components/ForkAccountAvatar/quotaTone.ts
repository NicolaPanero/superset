import { usageTone } from "../../../ForkUsageSummary/utils/parseUsageWindow";

export function quotaTone(remaining: number) {
	return usageTone(100 - remaining);
}

export const QUOTA_TONE_TEXT = {
	ok: "text-success",
	warning: "text-warning",
	danger: "text-destructive",
} as const;
