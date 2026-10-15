export const CLICK_LIMIT = 3;
export const CLICK_INTERVAL_MS = 400;
export const DRIFT_LIMIT = 16;
export const RIPPLE_LIMIT = CLICK_LIMIT + DRIFT_LIMIT;

interface Ripple {
	x: number;
	y: number;
	start: number;
	seed: number;
}

class RippleSet {
	private ripples: Ripple[] = [];

	constructor(
		private limit: number,
		private lifetime: number,
	) {}

	add(ripple: Ripple) {
		this.prune(ripple.start);
		if (this.ripples.length >= this.limit) return false;
		this.ripples.push(ripple);
		return true;
	}

	live(now: number) {
		this.prune(now);
		return this.ripples;
	}

	clear() {
		this.ripples = [];
	}

	private prune(now: number) {
		this.ripples = this.ripples.filter(
			(ripple) => now - ripple.start < this.lifetime,
		);
	}
}

export class ForkHomeRipples {
	private clicks = new RippleSet(CLICK_LIMIT, 4200);
	private drifts = new RippleSet(DRIFT_LIMIT, 9000);
	private lastClick = Number.NEGATIVE_INFINITY;

	constructor(private random = Math.random) {}

	click(x: number, y: number, now: number) {
		if (now - this.lastClick < CLICK_INTERVAL_MS) return false;
		const added = this.clicks.add({
			x,
			y,
			start: now,
			seed: this.random() * 100,
		});
		if (added) this.lastClick = now;
		return added;
	}

	drift(x: number, y: number, now: number) {
		return this.drifts.add({
			x,
			y,
			start: now,
			seed: -1 - this.random() * 100,
		});
	}

	clicking(now: number) {
		return this.clicks.live(now).length > 0;
	}

	write(target: Float32Array, now: number) {
		const ripples = [...this.clicks.live(now), ...this.drifts.live(now)];
		ripples.forEach((ripple, index) => {
			target.set(
				[
					ripple.x,
					ripple.y,
					Math.max(0, now - ripple.start) / 1000,
					ripple.seed,
				],
				index * 4,
			);
		});
		return ripples.length;
	}

	clear() {
		this.lastClick = Number.NEGATIVE_INFINITY;
		this.clicks.clear();
		this.drifts.clear();
	}
}
