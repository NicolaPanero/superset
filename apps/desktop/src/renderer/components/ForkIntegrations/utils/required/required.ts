/** For query and mutation callbacks that only run once `enabled` holds. */
export function required<T>(value: T | null | undefined): T {
	if (value === null || value === undefined)
		throw new Error("fork_value_unavailable");
	return value;
}
