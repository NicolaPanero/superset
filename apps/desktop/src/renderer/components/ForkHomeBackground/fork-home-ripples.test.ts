import { expect, test } from "bun:test";
import {
	CLICK_INTERVAL_MS,
	CLICK_LIMIT,
	DRIFT_LIMIT,
	ForkHomeRipples,
	RIPPLE_LIMIT,
} from "./fork-home-ripples";

test("rapid clicks are throttled and never evict running waves", () => {
	const ripples = new ForkHomeRipples(() => 0.5);
	const data = new Float32Array(RIPPLE_LIMIT * 4);
	expect(ripples.click(150, 250, 0)).toBe(true);
	expect(ripples.click(900, 900, CLICK_INTERVAL_MS - 1)).toBe(false);
	for (let click = 1; click <= CLICK_LIMIT * 2; click++)
		ripples.click(900, 900, click * CLICK_INTERVAL_MS);
	const now = CLICK_LIMIT * 2 * CLICK_INTERVAL_MS;
	expect(ripples.write(data, now)).toBe(CLICK_LIMIT);
	expect(data[0]).toBe(150);
	expect(data[1]).toBe(250);
	expect(data[2]).toBeCloseTo(now / 1000, 5);
});

test("grey drift waves have their own budget and never block clicks", () => {
	const ripples = new ForkHomeRipples(() => 0.5);
	const data = new Float32Array(RIPPLE_LIMIT * 4);
	for (let drift = 0; drift < DRIFT_LIMIT * 2; drift++)
		ripples.drift(drift, drift, drift);
	expect(ripples.click(10, 10, 100)).toBe(true);
	expect(ripples.write(data, 100)).toBe(DRIFT_LIMIT + 1);
	expect(data[3]).toBeGreaterThanOrEqual(0);
	expect(data[7]).toBeLessThan(0);
	expect(ripples.write(data, 50)).toBe(DRIFT_LIMIT + 1);
	expect(data[2]).toBe(0);
	expect(ripples.clicking(4400)).toBe(false);
	expect(ripples.write(data, 9200)).toBe(0);
});
