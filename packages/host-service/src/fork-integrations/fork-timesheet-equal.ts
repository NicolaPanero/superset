interface EqualTask {
	key: string;
	eligible: string[];
	assigned: number;
	fair: number;
}

export function forkAllocateTimesheetEqually(
	tasks: EqualTask[],
	need: Map<string, number>,
): Map<string, Map<string, number>> {
	const proposals = new Map<string, Map<string, number>>();
	const active = tasks.filter((task) => task.eligible.length > 0);
	const total = [...need.values()].reduce((sum, units) => sum + units, 0);
	for (const task of active) task.fair = total / active.length;
	for (const [day, units] of need) {
		const eligible = active.filter((task) => task.eligible.includes(day));
		if (!eligible.length) continue;
		for (let unit = 0; unit < units; unit++) {
			const next = eligible.reduce((best, task) =>
				task.assigned < best.assigned ||
				(task.assigned === best.assigned && task.key < best.key)
					? task
					: best,
			);
			const own = proposals.get(next.key) ?? new Map<string, number>();
			own.set(day, (own.get(day) ?? 0) + 1);
			proposals.set(next.key, own);
			next.assigned++;
			need.set(day, (need.get(day) ?? 0) - 1);
		}
	}
	return proposals;
}
