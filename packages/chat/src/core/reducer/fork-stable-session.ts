import type { SessionState } from "../../protocol/envelope";

const LISTS = [
	"availableCommands",
	"availableModes",
	"availableModels",
	"configOptions",
	"backgroundTasks",
	"contextUsage",
] as const;

function same(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	const left = a as Record<string, unknown>;
	const right = b as Record<string, unknown>;
	const keys = Object.keys(left);
	return (
		keys.length === Object.keys(right).length &&
		keys.every((key) => same(left[key], right[key]))
	);
}

/**
 * A session event repeats every list the agent reports. Equal lists keep the
 * previous objects, so a status change does not rebuild menus and transcript
 * rows that depend on them; an unchanged session keeps its identity.
 */
export function withStableSession(
	previous: SessionState | null,
	next: SessionState,
): SessionState {
	if (!previous) return next;
	let result = next;
	for (const key of LISTS) {
		const before = previous[key];
		if (before === undefined || before === next[key]) continue;
		if (!same(before, next[key])) continue;
		if (result === next) result = { ...next };
		(result as Record<string, unknown>)[key] = before;
	}
	return same(previous, result) ? previous : result;
}
