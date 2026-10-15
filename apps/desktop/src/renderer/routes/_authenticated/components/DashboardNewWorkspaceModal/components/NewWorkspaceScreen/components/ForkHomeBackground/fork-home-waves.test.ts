import { expect, test } from "bun:test";
import { ForkHomeWaves } from "./fork-home-waves";

test("automatic waves move without lighting the fixed logo", () => {
	const waves = new ForkHomeWaves(900, 500, 0, () => 0.5);
	const before = waves.sampleAmbient(600, 350);
	for (let frame = 1; frame <= 42; frame++) waves.advance((frame * 1000) / 60);
	expect(Math.abs(waves.sampleAmbient(600, 350) - before)).toBeGreaterThan(
		0.05,
	);
	expect(waves.sampleInteraction(600, 350)).toBe(0);
	expect(waves.active).toBe(false);
});

test("new clicks preserve the propagation of an earlier wave", () => {
	const original = new ForkHomeWaves(900, 500, 0, () => 0.5);
	const repeated = new ForkHomeWaves(900, 500, 0, () => 0.5);
	original.click(150, 250);
	repeated.click(150, 250);
	for (let frame = 1; frame <= 42; frame++) {
		repeated.click(780, 250);
		original.advance((frame * 1000) / 60);
		repeated.advance((frame * 1000) / 60);
	}
	expect(original.sampleInteraction(280, 250)).toBeGreaterThan(0.1);
	expect(repeated.sampleInteraction(280, 250)).toBeCloseTo(
		original.sampleInteraction(280, 250),
		3,
	);
});
