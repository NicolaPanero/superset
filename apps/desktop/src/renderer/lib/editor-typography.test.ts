import { describe, expect, test } from "bun:test";
import {
	resolveEditorLineHeight,
	resolveFontVariantLigatures,
} from "./editor-typography";
import { FORK_EDITOR_DEFAULTS } from "./fork-editor-appearance";

describe("editor typography", () => {
	test("rounds automatic line height using the platform default", () => {
		expect(resolveEditorLineHeight(13)).toBe(
			Math.round(13 * FORK_EDITOR_DEFAULTS.lineHeight),
		);
		expect(resolveEditorLineHeight(15.5)).toBe(
			Math.round(15.5 * FORK_EDITOR_DEFAULTS.lineHeight),
		);
	});

	test("uses the configured line-height multiplier without rounding", () => {
		expect(resolveEditorLineHeight(15.5, 1.4)).toBeCloseTo(21.7);
	});

	test("disables ligatures by default while honoring an explicit choice", () => {
		expect(resolveFontVariantLigatures()).toBe("none");
		expect(resolveFontVariantLigatures(true)).toBe("normal");
		expect(resolveFontVariantLigatures(false)).toBe("none");
	});
});
