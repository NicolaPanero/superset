import { expect, test } from "bun:test";
import {
	displayUsedPercent,
	parseUsageWindow,
	usageTone,
	usageWindowShortLabel,
} from "./parseUsageWindow";

test("Claude and Codex window labels keep their hour count and model scope", () => {
	expect(parseUsageWindow("Session (5h)")).toEqual({
		kind: "session",
		hours: 5,
		scope: null,
	});
	expect(parseUsageWindow("Session (5h) · Spark")).toEqual({
		kind: "session",
		hours: 5,
		scope: "Spark",
	});
	expect(parseUsageWindow("Weekly")).toEqual({ kind: "weekly", scope: null });
	expect(parseUsageWindow("Weekly · Sonnet")).toEqual({
		kind: "weekly",
		scope: "Sonnet",
	});
	expect(parseUsageWindow("30d")).toEqual({ kind: "other", label: "30d" });
});

test("short labels are language neutral", () => {
	expect(usageWindowShortLabel("Session (5h)")).toBe("5h");
	expect(usageWindowShortLabel("Weekly · Opus")).toBe("7d");
	expect(usageWindowShortLabel("Limit")).toBe("Limit");
});

test("a value below 100 never displays as exhausted", () => {
	expect(displayUsedPercent(99.99)).toBe(99);
	expect(displayUsedPercent(100)).toBe(100);
	expect(displayUsedPercent(130)).toBe(100);
	expect(displayUsedPercent(26.6)).toBe(27);
	expect(displayUsedPercent(Number.NaN)).toBe(0);
});

test("tone follows the same thresholds as the pane usage ring", () => {
	expect(usageTone(69)).toBe("ok");
	expect(usageTone(70)).toBe("warning");
	expect(usageTone(90)).toBe("danger");
});
