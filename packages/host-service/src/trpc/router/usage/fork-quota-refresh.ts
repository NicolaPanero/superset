import { getQuota } from "./fork-quota-cache";
import { expireQuotaFetches } from "./fork-quota-fetch";

const BACKGROUND_MS = 60_000;
const AFTER_TURN_MS = 5_000;
const AFTER_TURN_GAP_MS = 60_000;

type Timer = { unref?: () => void };

/**
 * Keeps account usage current while the host runs, whether or not a window
 * asks: a read every minute, which reaches each provider at most every five
 * minutes, and a fresh read shortly after an agent turn ends, since a turn is
 * what moves usage.
 */
export function createQuotaRefresh({
	read = (force: boolean) => getQuota(force),
	expire = expireQuotaFetches,
	now = Date.now,
	after = (run: () => void, ms: number): Timer => setTimeout(run, ms),
	cancel = (timer: Timer) =>
		clearTimeout(timer as ReturnType<typeof setTimeout>),
	every = (run: () => void, ms: number): Timer => setInterval(run, ms),
	stopEvery = (timer: Timer) =>
		clearInterval(timer as ReturnType<typeof setInterval>),
}: {
	read?: (force: boolean) => Promise<unknown>;
	expire?: () => void;
	now?: () => number;
	after?: (run: () => void, ms: number) => Timer;
	cancel?: (timer: Timer) => void;
	every?: (run: () => void, ms: number) => Timer;
	stopEvery?: (timer: Timer) => void;
} = {}) {
	let pending: Timer | undefined;
	let lastAfterTurn = Number.NEGATIVE_INFINITY;
	const run = (force: boolean) => void read(force).catch(() => {});
	return {
		afterTurn() {
			if (pending) return;
			const wait = Math.max(
				AFTER_TURN_MS,
				lastAfterTurn + AFTER_TURN_GAP_MS - now(),
			);
			pending = after(() => {
				pending = undefined;
				lastAfterTurn = now();
				expire();
				run(true);
			}, wait);
			pending.unref?.();
		},
		start() {
			const timer = every(() => run(false), BACKGROUND_MS);
			timer.unref?.();
			return () => {
				stopEvery(timer);
				if (pending) cancel(pending);
				pending = undefined;
			};
		},
	};
}

const quotaRefresh = createQuotaRefresh();
export const startQuotaRefresh = () => quotaRefresh.start();
export const refreshQuotaAfterTurn = () => quotaRefresh.afterTurn();
