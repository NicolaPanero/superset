/**
 * Timesheet proposal: spreads time over working days that have less than the
 * minimum logged. A pure calculation; Jira is read and written elsewhere.
 */

export interface ForkTimesheetSettings {
	enabled: boolean;
	project: string;
	moduleField: string;
	modules: string[];
	includeInProgress: boolean;
	minHours: number;
	maxHours: number;
	stepMinutes: 15 | 30 | 60;
	dayStart: string;
	lunchStart: string;
	lunchEnd: string;
	dayEnd: string;
	timeZone: string;
	holidays: "IT" | "none";
	vacations: { from: string; to: string }[];
}

export function forkDefaultTimesheetSettings(
	timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): ForkTimesheetSettings {
	return {
		enabled: false,
		project: "",
		moduleField: "",
		modules: [],
		includeInProgress: true,
		minHours: 6,
		maxHours: 8,
		stepMinutes: 30,
		dayStart: "09:00",
		lunchStart: "13:00",
		lunchEnd: "14:30",
		dayEnd: "18:00",
		timeZone,
		holidays: "IT",
		vacations: [],
	};
}

export interface ForkTimesheetTaskInput {
	key: string;
	summary: string;
	type: string | null;
	comments: number;
	links: number;
	state: "done" | "in_progress";
	/** First day the task can receive time (creation or start of work). */
	from: string;
	/** Last day: resolution day, or the last day of the period for open work. */
	to: string;
}

export interface ForkTimesheetEntry {
	id: string;
	date: string;
	time: string;
	key: string;
	seconds: number;
}

export interface ForkTimesheetProposal {
	entries: ForkTimesheetEntry[];
	days: {
		date: string;
		existingSeconds: number;
		proposedSeconds: number;
	}[];
	tasks: {
		key: string;
		summary: string;
		state: "done" | "in_progress";
		seconds: number;
		fairSeconds: number;
		inflated: boolean;
	}[];
	skippedFullDays: string[];
	gaps: { date: string; seconds: number }[];
	unplacedSeconds: number;
	valid: boolean;
}

const TYPE_WEIGHT: Record<string, number> = {
	Bug: 1.0,
	Task: 1.15,
	Story: 2.0,
	Quote: 1.8,
	Improvement: 1.35,
};
const DESIRED_BUCKETS = [6, 6, 6.5, 6.5, 6.5, 7, 7, 7, 7, 7.5, 7.5, 7.5, 8];
const DAY_MS = 86_400_000;
const EPOCH_ORDINAL = 719_163;

const dayNumber = (day: string) =>
	Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
const fromDayNumber = (value: number) =>
	new Date(value * DAY_MS).toISOString().slice(0, 10);
const minutes = (time: string) => {
	const [hour = 0, minute = 0] = time.split(":").map(Number);
	return hour * 60 + minute;
};
const clock = (value: number) =>
	`${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

export function forkEasterSunday(year: number): string {
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const month = Math.floor((h + l - 7 * m + 114) / 31);
	const day = ((h + l - 7 * m + 114) % 31) + 1;
	return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function forkItalianHolidays(year: number): Set<string> {
	const easter = forkEasterSunday(year);
	const fixed = [
		"01-01",
		"01-06",
		"04-25",
		"05-01",
		"06-02",
		"08-15",
		"11-01",
		"12-08",
		"12-25",
		"12-26",
	];
	return new Set([
		...fixed.map((day) => `${year}-${day}`),
		easter,
		fromDayNumber(dayNumber(easter) + 1),
	]);
}

export function forkWorkingDayChecker(
	settings: Pick<ForkTimesheetSettings, "holidays" | "vacations">,
	extraVacations: { from: string; to: string }[] = [],
): (day: string) => boolean {
	const off = new Set<string>();
	for (const range of [...settings.vacations, ...extraVacations])
		for (let d = dayNumber(range.from); d <= dayNumber(range.to); d++)
			off.add(fromDayNumber(d));
	const holidays = new Map<number, Set<string>>();
	return (day) => {
		const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
		if (weekday === 0 || weekday === 6 || off.has(day)) return false;
		if (settings.holidays === "none") return true;
		const year = Number(day.slice(0, 4));
		let set = holidays.get(year);
		if (!set) {
			set = forkItalianHolidays(year);
			holidays.set(year, set);
		}
		return !set.has(day);
	};
}

function commentFactor(count: number): number {
	if (count <= 0) return 0.7;
	if (count <= 2) return 1;
	if (count <= 5) return 1.8;
	if (count <= 9) return 2.7;
	return 3.8;
}

function desiredHours(day: string, min: number, max: number): number {
	const ordinal = dayNumber(day) + EPOCH_ORDINAL;
	const raw = DESIRED_BUCKETS[ordinal % DESIRED_BUCKETS.length] ?? 7;
	return Math.min(max, Math.max(min, raw));
}

/** Units of `step` to add so the day lands closest to the desired total. */
function neededUnits(
	existingHours: number,
	desired: number,
	min: number,
	max: number,
	perHour: number,
): number {
	if (existingHours >= min - 1e-6) return 0;
	let best: { distance: number; total: number; units: number } | null = null;
	for (let units = 1; units <= max * perHour; units++) {
		const total = existingHours + units / perHour;
		if (total > max + 1e-6) break;
		if (total + 1e-9 < min) continue;
		const distance = Math.abs(total - desired);
		if (
			!best ||
			distance < best.distance ||
			(distance === best.distance && total < best.total)
		)
			best = { distance, total, units };
	}
	return best?.units ?? 0;
}

interface PlannedTask extends ForkTimesheetTaskInput {
	score: number;
	eligible: string[];
	assigned: number;
	fair: number;
	unplaced: number;
	end: number;
}

function allocate(
	tasks: PlannedTask[],
	need: Map<string, number>,
	perHour: number,
): Map<string, Map<string, number>> {
	const proposals = new Map<string, Map<string, number>>();
	const total = [...need.values()].reduce((sum, value) => sum + value, 0);
	if (tasks.length === 0 || total <= 0) return proposals;
	const scoreSum = tasks.reduce((sum, task) => sum + task.score, 0) || 1;
	const base = perHour * (perHour * tasks.length <= total ? 1 : 0.5);
	const minUnits = Math.max(1, Math.round(base));
	const rest = total - minUnits * tasks.length;
	const raw = tasks.map((task) => (rest * task.score) / scoreSum);
	const floors = raw.map((value) => Math.floor(value));
	let left = rest - floors.reduce((sum, value) => sum + value, 0);
	for (const index of raw
		.map((value, index) => ({ index, frac: value - Math.floor(value) }))
		.sort((a, b) => b.frac - a.frac)
		.map((entry) => entry.index)) {
		if (left <= 0) break;
		floors[index] = (floors[index] ?? 0) + 1;
		left--;
	}
	tasks.forEach((task, index) => {
		task.fair = Math.max(1, minUnits + (floors[index] ?? 0));
	});
	const place = (task: PlannedTask, day: string, units: number) => {
		const available = need.get(day) ?? 0;
		const placed = Math.min(units, available);
		if (placed <= 0) return 0;
		const own = proposals.get(task.key) ?? new Map<string, number>();
		own.set(day, (own.get(day) ?? 0) + placed);
		proposals.set(task.key, own);
		task.assigned += placed;
		need.set(day, available - placed);
		return placed;
	};
	const maxChunk = 3 * perHour;
	for (const task of [...tasks].sort(
		(a, b) => a.eligible.length - b.eligible.length || b.score - a.score,
	)) {
		let remain = task.fair;
		for (const day of [...task.eligible].reverse()) {
			const available = need.get(day) ?? 0;
			if (remain <= 0 || available <= 0) continue;
			const others = tasks.filter(
				(other) =>
					other !== task &&
					other.eligible.includes(day) &&
					other.assigned < other.fair,
			).length;
			const reserve =
				others && available > 2 ? Math.min(available - 1, others) : 0;
			const room = Math.max(1, available - Math.max(0, reserve));
			remain -= place(task, day, Math.min(remain, room, maxChunk));
		}
		task.unplaced = remain;
	}
	for (const task of [...tasks].sort(
		(a, b) => b.unplaced - a.unplaced || a.eligible.length - b.eligible.length,
	)) {
		let remain = task.unplaced;
		for (const day of [...task.eligible].reverse()) {
			const available = need.get(day) ?? 0;
			if (remain <= 0 || available <= 0) continue;
			remain -= place(task, day, Math.min(remain, available, 2 * perHour));
		}
		task.unplaced = remain;
	}
	for (const day of [...need.keys()]) {
		const eligible = tasks.filter((task) => task.eligible.includes(day));
		let cursor = 0;
		for (
			let guard = 0;
			(need.get(day) ?? 0) > 0 && eligible.length && guard < 80;
			guard++
		) {
			const under = eligible.filter((task) => task.assigned < task.fair * 1.35);
			const pool = (
				under.length
					? under
					: eligible.filter((task) => task.assigned < task.fair * 2).length
						? eligible.filter((task) => task.assigned < task.fair * 2)
						: eligible
			).sort(
				(a, b) =>
					a.assigned / Math.max(a.fair, 1) - b.assigned / Math.max(b.fair, 1) ||
					a.end - dayNumber(day) - (b.end - dayNumber(day)) ||
					b.score - a.score,
			);
			const task = pool[cursor % pool.length];
			cursor++;
			if (task) place(task, day, 1);
		}
	}
	for (const task of tasks) {
		if (task.assigned > 0) continue;
		for (const day of [...task.eligible].reverse()) {
			const donors = [...proposals.entries()].filter(
				([key, days]) => key !== task.key && (days.get(day) ?? 0) >= 2,
			);
			const donor = donors.sort(
				(a, b) => (b[1].get(day) ?? 0) - (a[1].get(day) ?? 0),
			)[0];
			if (!donor) continue;
			donor[1].set(day, (donor[1].get(day) ?? 0) - 1);
			const donorTask = tasks.find((t) => t.key === donor[0]);
			if (donorTask) donorTask.assigned--;
			const own = proposals.get(task.key) ?? new Map<string, number>();
			own.set(day, (own.get(day) ?? 0) + 1);
			proposals.set(task.key, own);
			task.assigned++;
			break;
		}
	}
	return proposals;
}

export function forkProposeTimesheet({
	settings,
	from,
	to,
	tasks,
	existingSeconds,
	extraVacations = [],
	newId,
}: {
	settings: ForkTimesheetSettings;
	from: string;
	to: string;
	tasks: ForkTimesheetTaskInput[];
	existingSeconds: Map<string, number>;
	extraVacations?: { from: string; to: string }[];
	newId: () => string;
}): ForkTimesheetProposal {
	const working = forkWorkingDayChecker(settings, extraVacations);
	const perHour = 60 / settings.stepMinutes;
	const unitSeconds = settings.stepMinutes * 60;
	const days: string[] = [];
	for (let d = dayNumber(from); d <= dayNumber(to); d++) {
		const day = fromDayNumber(d);
		if (working(day)) days.push(day);
	}
	const need = new Map(
		days.map((day) => {
			const existing = (existingSeconds.get(day) ?? 0) / 3600;
			return [
				day,
				neededUnits(
					existing,
					desiredHours(day, settings.minHours, settings.maxHours),
					settings.minHours,
					settings.maxHours,
					perHour,
				),
			] as const;
		}),
	);
	const previousWorking = (day: string) => {
		let d = dayNumber(day);
		while (!working(fromDayNumber(d)) && d > dayNumber(from) - 400) d--;
		return fromDayNumber(d);
	};
	const planned: PlannedTask[] = tasks.map((task) => {
		const end = working(task.to) ? task.to : previousWorking(task.to);
		let start = dayNumber(task.from) > dayNumber(from) ? task.from : from;
		if (dayNumber(end) < dayNumber(start)) start = end;
		let eligible = days.filter(
			(day) =>
				dayNumber(day) >= dayNumber(start) && dayNumber(day) <= dayNumber(end),
		);
		if (eligible.length === 0 && days.length > 0)
			eligible = [days.includes(end) ? end : (days[0] ?? end)];
		const score =
			(TYPE_WEIGHT[task.type ?? ""] ?? 1.2) *
			commentFactor(task.comments) *
			(1 + 0.75 * task.links);
		return {
			...task,
			score,
			eligible,
			assigned: 0,
			fair: 0,
			unplaced: 0,
			end: dayNumber(task.to),
		};
	});
	const proposals = allocate(planned, need, perHour);
	const lunchStart = minutes(settings.lunchStart);
	const lunchEnd = minutes(settings.lunchEnd);
	const entries: ForkTimesheetEntry[] = [];
	for (const day of days) {
		let cursor =
			minutes(settings.dayStart) +
			Math.round((existingSeconds.get(day) ?? 0) / 60);
		if (cursor > lunchStart && cursor < lunchEnd) cursor = lunchEnd;
		for (const task of planned) {
			const units = proposals.get(task.key)?.get(day) ?? 0;
			if (units <= 0) continue;
			if (cursor >= lunchStart && cursor < lunchEnd) cursor = lunchEnd;
			entries.push({
				id: newId(),
				date: day,
				time: clock(Math.min(cursor, 23 * 60 + 59)),
				key: task.key,
				seconds: units * unitSeconds,
			});
			const duration = units * settings.stepMinutes;
			cursor =
				cursor < lunchStart && cursor + duration > lunchStart
					? lunchEnd + (cursor + duration - lunchStart)
					: cursor + duration;
		}
	}
	const proposedByDay = new Map<string, number>();
	for (const entry of entries)
		proposedByDay.set(
			entry.date,
			(proposedByDay.get(entry.date) ?? 0) + entry.seconds,
		);
	const dayRows = days.map((day) => ({
		date: day,
		existingSeconds: existingSeconds.get(day) ?? 0,
		proposedSeconds: proposedByDay.get(day) ?? 0,
	}));
	const gaps = dayRows
		.map((row) => ({
			date: row.date,
			seconds: row.existingSeconds + row.proposedSeconds,
		}))
		.filter(
			(row) =>
				row.seconds + 72 < settings.minHours * 3600 ||
				row.seconds > settings.maxHours * 3600 + 72,
		);
	const unplacedSeconds =
		[...need.values()].reduce((sum, units) => sum + units, 0) * unitSeconds;
	return {
		entries,
		days: dayRows,
		tasks: planned
			.map((task) => ({
				key: task.key,
				summary: task.summary,
				state: task.state,
				seconds: task.assigned * unitSeconds,
				fairSeconds: task.fair * unitSeconds,
				inflated: task.fair > 0 && task.assigned > task.fair * 1.8,
			}))
			.sort((a, b) => b.seconds - a.seconds || a.key.localeCompare(b.key)),
		skippedFullDays: dayRows
			.filter(
				(row) =>
					row.existingSeconds >= settings.minHours * 3600 &&
					row.proposedSeconds === 0,
			)
			.map((row) => row.date),
		gaps,
		unplacedSeconds,
		valid: gaps.length === 0 && unplacedSeconds === 0,
	};
}
