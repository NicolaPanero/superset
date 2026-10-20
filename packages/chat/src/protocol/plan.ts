import type { Plan } from "./items";

export type PlanEntryStatus = Plan["entries"][number]["status"];

/**
 * Agents and harnesses emit several spellings (`inProgress`, `in_progress`, …).
 * UI and journals only accept the three protocol statuses.
 */
export function normalizePlanEntryStatus(
	status: string | undefined,
): PlanEntryStatus {
	if (status === "in_progress" || status === "inProgress") return "in_progress";
	if (status === "completed") return "completed";
	return "pending";
}
