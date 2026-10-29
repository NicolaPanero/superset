import { expect, test } from "bun:test";
import {
	type ForkTimesheetTaskInput,
	forkDefaultTimesheetSettings,
	forkEasterSunday,
	forkProposeTimesheet,
	forkWorkingDayChecker,
} from "./fork-timesheet";

const settings = {
	...forkDefaultTimesheetSettings("Europe/Rome"),
	enabled: true,
};
let next = 0;
const newId = () => `e${next++}`;
const task = (
	key: string,
	from: string,
	to: string,
	state: ForkTimesheetTaskInput["state"] = "done",
): ForkTimesheetTaskInput => ({
	key,
	summary: key,
	type: "Task",
	comments: 2,
	links: 0,
	state,
	from,
	to,
});

test("Italian holidays and weekends are not working days", () => {
	expect(forkEasterSunday(2026)).toBe("2026-04-05");
	const working = forkWorkingDayChecker(settings);
	expect(working("2026-04-06")).toBe(false);
	expect(working("2026-04-25")).toBe(false);
	expect(working("2026-10-31")).toBe(false);
	expect(working("2026-10-30")).toBe(true);
	expect(
		forkWorkingDayChecker({
			...settings,
			vacations: [{ from: "2026-10-30", to: "2026-10-30" }],
		})("2026-10-30"),
	).toBe(false);
});

test("fills empty days within the limits, in 30 minute steps, and skips full days", () => {
	const proposal = forkProposeTimesheet({
		settings,
		from: "2026-10-19",
		to: "2026-10-30",
		tasks: [
			task("A-1", "2026-10-19", "2026-10-23"),
			task("A-2", "2026-10-20", "2026-11-01"),
		],
		existingSeconds: new Map([["2026-10-21", 6 * 3600]]),
		newId,
	});
	expect(proposal.skippedFullDays).toEqual(["2026-10-21"]);
	for (const day of proposal.days) {
		const total = day.existingSeconds + day.proposedSeconds;
		expect(total).toBeLessThanOrEqual(8 * 3600);
		expect(total).toBeGreaterThanOrEqual(6 * 3600);
	}
	for (const entry of proposal.entries) {
		expect(entry.seconds % 1800).toBe(0);
		const [hour = 0, minute = 0] = entry.time.split(":").map(Number);
		const at = hour * 60 + minute;
		expect(at < 13 * 60 || at >= 14 * 60 + 30).toBe(true);
	}
	expect(
		proposal.entries.some((e) => e.key === "A-1" && e.date > "2026-10-23"),
	).toBe(false);
	expect(
		proposal.entries.some((e) => e.key === "A-2" && e.date === "2026-10-30"),
	).toBe(true);
	expect(proposal.valid).toBe(true);
});

test("start times follow each other from the start of the day and jump the lunch break", () => {
	const proposal = forkProposeTimesheet({
		settings,
		from: "2026-10-30",
		to: "2026-10-30",
		tasks: [
			task("B-1", "2026-10-30", "2026-10-30"),
			task("B-2", "2026-10-30", "2026-10-30"),
		],
		existingSeconds: new Map(),
		newId,
	});
	const [first, second] = proposal.entries;
	expect(first?.time).toBe("09:00");
	const end = 9 * 60 + (first?.seconds ?? 0) / 60;
	const expected = end > 13 * 60 ? 14 * 60 + 30 + (end - 13 * 60) : end;
	const [h = 0, m = 0] = (second?.time ?? "").split(":").map(Number);
	expect(h * 60 + m).toBe(
		expected >= 13 * 60 && expected < 14 * 60 + 30 ? 14 * 60 + 30 : expected,
	);
});

test("work in progress counts from the day work started and keeps existing time", () => {
	const proposal = forkProposeTimesheet({
		settings,
		from: "2026-10-01",
		to: "2026-10-16",
		tasks: [task("C-1", "2026-10-12", "2026-10-16", "in_progress")],
		existingSeconds: new Map([["2026-10-13", 2 * 3600]]),
		newId,
	});
	expect(proposal.entries.every((e) => e.date >= "2026-10-12")).toBe(true);
	const day13 = proposal.days.find((d) => d.date === "2026-10-13");
	expect(day13?.existingSeconds).toBe(7200);
	expect(
		(day13?.existingSeconds ?? 0) + (day13?.proposedSeconds ?? 0),
	).toBeLessThanOrEqual(8 * 3600);
	expect(proposal.tasks[0]?.state).toBe("in_progress");
});

test("a task closed on Sunday gets time up to Friday", () => {
	const proposal = forkProposeTimesheet({
		settings,
		from: "2026-10-26",
		to: "2026-11-02",
		tasks: [task("D-1", "2026-10-26", "2026-11-01")],
		existingSeconds: new Map([["2026-11-02", 8 * 3600]]),
		newId,
	});
	expect(proposal.entries.some((e) => e.date === "2026-10-30")).toBe(true);
	expect(proposal.entries.some((e) => e.date > "2026-10-30")).toBe(false);
});
