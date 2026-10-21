import { expect, test } from "bun:test";
import {
	descendantsOf,
	ForkAgentProcesses,
	type ProcessRow,
	parseProcessRows,
} from "./forkAgentProcesses";

const row = (pid: number, ppid: number, pgid = pid, started = `t${pid}`) => ({
	pid,
	ppid,
	pgid,
	started,
});

test("ps rows keep the full start time", () => {
	expect(
		parseProcessRows(
			"  101     1   101 Tue Oct 21 19:30:01 2026\n  102   101   101 Tue Oct 21 19:30:02 2026\n",
		),
	).toEqual([
		{ pid: 101, ppid: 1, pgid: 101, started: "Tue Oct 21 19:30:01 2026" },
		{ pid: 102, ppid: 101, pgid: 101, started: "Tue Oct 21 19:30:02 2026" },
	]);
});

test("descendants include grandchildren but not the agent or unrelated processes", () => {
	const rows = [row(10, 1), row(11, 10), row(12, 11, 11), row(20, 1)];
	expect(descendantsOf(10, rows).map((item) => item.pid)).toEqual([11, 12]);
});

test("a background command started by the agent stops after the agent, even reparented", async () => {
	let rows: ProcessRow[] = [
		row(10, 1),
		row(11, 10),
		row(12, 11, 11),
		row(20, 1),
	];
	const signals: [number, string][] = [];
	const processes = new ForkAgentProcesses(10, {
		list: async () => rows,
		signal: (target, value) => {
			signals.push([target, value]);
			if (value === "SIGTERM" && target === 11)
				rows = rows.filter((r) => r.pid !== 11);
		},
		sampleMs: 60_000,
		wait: async () => {},
	});
	await processes.sample();
	rows = [row(11, 1, 11), row(12, 1, 11), row(20, 1), row(30, 1)];
	await processes.reap();
	expect(signals).toEqual([
		[-11, "SIGTERM"],
		[11, "SIGTERM"],
		[12, "SIGTERM"],
		[12, "SIGKILL"],
	]);
});

test("a reused pid is never signalled", async () => {
	let rows: ProcessRow[] = [row(10, 1), row(11, 10)];
	const signals: number[] = [];
	const processes = new ForkAgentProcesses(10, {
		list: async () => rows,
		signal: (target) => signals.push(target),
		sampleMs: 60_000,
		wait: async () => {},
	});
	await processes.sample();
	rows = [row(11, 1, 11, "a later process")];
	await processes.reap();
	expect(signals).toEqual([]);
});
