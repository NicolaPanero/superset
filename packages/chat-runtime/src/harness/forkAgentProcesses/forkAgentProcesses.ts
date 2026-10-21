import { execFile } from "node:child_process";

export type ProcessRow = {
	pid: number;
	ppid: number;
	pgid: number;
	started: string;
};

type ListProcesses = () => Promise<ProcessRow[]>;
type Signal = (target: number, signal: NodeJS.Signals) => void;

const SUPPORTED = process.platform !== "win32";
const SAMPLE_MS = 5000;
const KILL_GRACE_MS = 500;

export function parseProcessRows(output: string): ProcessRow[] {
	const rows: ProcessRow[] = [];
	for (const line of output.split("\n")) {
		const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
		if (!match) continue;
		rows.push({
			pid: Number(match[1]),
			ppid: Number(match[2]),
			pgid: Number(match[3]),
			started: match[4] ?? "",
		});
	}
	return rows;
}

const listProcesses: ListProcesses = () =>
	new Promise((resolve) => {
		execFile(
			"ps",
			["-A", "-o", "pid=,ppid=,pgid=,lstart="],
			{ maxBuffer: 8 * 1024 * 1024 },
			(error, stdout) => resolve(error ? [] : parseProcessRows(stdout)),
		);
	});

export function descendantsOf(rootPid: number, rows: ProcessRow[]) {
	const children = new Map<number, ProcessRow[]>();
	for (const row of rows) {
		const siblings = children.get(row.ppid) ?? [];
		siblings.push(row);
		children.set(row.ppid, siblings);
	}
	const found: ProcessRow[] = [];
	const pending = [rootPid];
	while (pending.length > 0) {
		const pid = pending.pop() as number;
		for (const child of children.get(pid) ?? []) {
			if (child.pid === rootPid || found.includes(child)) continue;
			found.push(child);
			pending.push(child.pid);
		}
	}
	return found;
}

/**
 * Remembers the processes an agent starts, so its background commands stop
 * with it. They often run in their own process group, which outlives the
 * agent's group and is reparented to init when the agent exits.
 */
export class ForkAgentProcesses {
	private readonly known = new Map<number, ProcessRow>();
	private timer: ReturnType<typeof setInterval> | undefined;
	private stopped = false;
	private reaping: Promise<void> | undefined;

	constructor(
		private readonly rootPid: number | undefined,
		private readonly options: {
			list?: ListProcesses;
			signal?: Signal;
			sampleMs?: number;
			graceMs?: number;
			wait?: (ms: number) => Promise<void>;
		} = {},
	) {
		if (!this.enabled) return;
		this.timer = setInterval(
			() => void this.sample(),
			options.sampleMs ?? SAMPLE_MS,
		);
		this.timer.unref?.();
	}

	private get enabled() {
		return (SUPPORTED || this.options.list) && this.rootPid !== undefined;
	}

	async sample(): Promise<void> {
		if (!this.enabled || this.stopped) return;
		const rows = await (this.options.list ?? listProcesses)();
		for (const row of descendantsOf(this.rootPid as number, rows))
			this.known.set(row.pid, row);
	}

	/** Stops the remembered processes that are still the same processes. */
	reap(): Promise<void> {
		this.reaping ??= this.stopKnown();
		return this.reaping;
	}

	private async stopKnown(): Promise<void> {
		this.stopped = true;
		clearInterval(this.timer);
		if (!this.enabled || this.known.size === 0) return;
		const list = this.options.list ?? listProcesses;
		const signal: Signal =
			this.options.signal ?? ((target, value) => process.kill(target, value));
		const alive = async () => {
			const rows = await list();
			return rows.filter(
				(row) =>
					row.pid !== process.pid &&
					this.known.get(row.pid)?.started === row.started,
			);
		};
		const send = (rows: ProcessRow[], value: NodeJS.Signals) => {
			for (const row of rows) {
				for (const target of row.pgid === row.pid
					? [-row.pid, row.pid]
					: [row.pid]) {
					try {
						signal(target, value);
					} catch {}
				}
			}
		};
		send(await alive(), "SIGTERM");
		await (
			this.options.wait ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
		)(this.options.graceMs ?? KILL_GRACE_MS);
		send(await alive(), "SIGKILL");
	}
}
