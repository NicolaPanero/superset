import { usageTone } from "../../../ForkUsageSummary/utils/parseUsageWindow";

export function quotaTone(remaining: number) {
	return usageTone(100 - remaining);
}
