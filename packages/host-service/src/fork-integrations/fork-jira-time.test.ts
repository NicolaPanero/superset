import { expect, test } from "bun:test";
import {
	forkJiraStarted,
	forkLocalDate,
	forkResolveLocalTime,
} from "./fork-jira-time";

const tz = "Europe/Rome";

test("winter and summer times get their own offset", () => {
	const winter = forkResolveLocalTime({
		date: "2026-01-15",
		time: "09:00",
		timeZone: tz,
	});
	expect(winter.kind).toBe("ok");
	if (winter.kind === "missing") throw new Error("unreachable");
	expect(forkJiraStarted(winter)).toBe("2026-01-15T09:00:00.000+0100");
	const summer = forkResolveLocalTime({
		date: "2026-07-15",
		time: "14:30",
		timeZone: tz,
	});
	if (summer.kind === "missing") throw new Error("unreachable");
	expect(forkJiraStarted(summer)).toBe("2026-07-15T14:30:00.000+0200");
});

test("a time skipped by the spring change does not exist", () => {
	expect(
		forkResolveLocalTime({ date: "2026-03-29", time: "02:30", timeZone: tz }),
	).toEqual({
		kind: "missing",
	});
});

test("a time repeated by the autumn change uses its first occurrence", () => {
	const result = forkResolveLocalTime({
		date: "2026-10-25",
		time: "02:30",
		timeZone: tz,
	});
	expect(result.kind).toBe("ambiguous");
	if (result.kind === "missing") throw new Error("unreachable");
	expect(forkJiraStarted(result)).toBe("2026-10-25T02:30:00.000+0200");
});

test("local date follows the time zone, not UTC", () => {
	expect(forkLocalDate(Date.UTC(2026, 9, 29, 23, 30), tz)).toBe("2026-10-30");
});
