import { expect, test } from "bun:test";
import { formatForkDuration, parseForkDuration } from "./forkDuration";

test("reads the usual Jira durations", () => {
	expect(parseForkDuration("45m")).toBe(2700);
	expect(parseForkDuration("1h 30m")).toBe(5400);
	expect(parseForkDuration("2h")).toBe(7200);
	expect(parseForkDuration("1,5h")).toBe(5400);
	expect(parseForkDuration("90")).toBe(5400);
});

test("rejects empty, zero and malformed values", () => {
	for (const value of ["", "0", "0m", "1d", "h", "1h 1h", "abc 1h"])
		expect(parseForkDuration(value)).toBeNull();
});

test("formats back in the same notation", () => {
	expect(formatForkDuration(2700)).toBe("45m");
	expect(formatForkDuration(5400)).toBe("1h 30m");
	expect(formatForkDuration(7200)).toBe("2h");
});
