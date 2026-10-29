const pad = (value: number, size = 2) => String(value).padStart(size, "0");

function offsetMinutes(instant: number, timeZone: string): number {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).formatToParts(new Date(instant));
	const value = (type: string) =>
		Number(parts.find((part) => part.type === type)?.value);
	const wall = Date.UTC(
		value("year"),
		value("month") - 1,
		value("day"),
		value("hour"),
		value("minute"),
		value("second"),
	);
	return Math.round((wall - Math.floor(instant / 1000) * 1000) / 60_000);
}

export type ForkLocalTime =
	| { kind: "ok"; instant: number; offsetMinutes: number }
	| { kind: "ambiguous"; instant: number; offsetMinutes: number }
	| { kind: "missing" };

/** Resolves a wall-clock date and time in a time zone, across DST changes. */
export function forkResolveLocalTime({
	date,
	time,
	timeZone,
}: {
	date: string;
	time: string;
	timeZone: string;
}): ForkLocalTime {
	const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
	const [hour = 0, minute = 0] = time.split(":").map(Number);
	const wall = Date.UTC(year, month - 1, day, hour, minute);
	const offsets = new Set([
		offsetMinutes(wall - 86_400_000, timeZone),
		offsetMinutes(wall + 86_400_000, timeZone),
	]);
	const matches = [...offsets]
		.map((offset) => ({ offset, instant: wall - offset * 60_000 }))
		.filter(
			({ instant, offset }) => offsetMinutes(instant, timeZone) === offset,
		)
		.sort((a, b) => a.instant - b.instant);
	const first = matches[0];
	if (!first) return { kind: "missing" };
	return {
		kind: matches.length > 1 ? "ambiguous" : "ok",
		instant: first.instant,
		offsetMinutes: first.offset,
	};
}

/** Jira's worklog `started` format, e.g. 2026-10-30T09:00:00.000+0100. */
export function forkJiraStarted({
	instant,
	offsetMinutes,
}: {
	instant: number;
	offsetMinutes: number;
}): string {
	const local = new Date(instant + offsetMinutes * 60_000);
	const sign = offsetMinutes < 0 ? "-" : "+";
	const abs = Math.abs(offsetMinutes);
	return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:00.000${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
}

/** Calendar day of an instant in a time zone, as YYYY-MM-DD. */
export function forkLocalDate(instant: number, timeZone: string): string {
	const local = new Date(instant + offsetMinutes(instant, timeZone) * 60_000);
	return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
}
