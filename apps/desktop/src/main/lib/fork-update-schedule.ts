export const FORK_UPDATE_INTERVAL_MS = 15 * 60_000;
export const FORK_UPDATE_FIRST_DELAY_MS = 60_000;
const FOREGROUND_COOLDOWN_MS = 60_000;

interface ForkUpdateSchedule {
	check: () => void;
	now: () => number;
	after: (callback: () => void, delay: number) => () => void;
	every: (callback: () => void, delay: number) => () => void;
	onFocus: (callback: () => void) => () => void;
	onResume: (callback: () => void) => () => void;
}
export function scheduleForkUpdateChecks(
	options: ForkUpdateSchedule,
): () => void {
	let lastCheck = options.now();
	const check = () => {
		lastCheck = options.now();
		options.check();
	};
	const foreground = () => {
		if (options.now() - lastCheck >= FOREGROUND_COOLDOWN_MS) check();
	};
	const stop = [
		options.after(check, FORK_UPDATE_FIRST_DELAY_MS),
		options.every(check, FORK_UPDATE_INTERVAL_MS),
		options.onFocus(foreground),
		options.onResume(foreground),
	];
	return () => {
		for (const dispose of stop) dispose();
	};
}
