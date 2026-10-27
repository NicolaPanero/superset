import { expect, test } from "bun:test";
import { ForkAgentProcesses, type ProcessRow } from "./forkAgentProcesses";

const child: ProcessRow = { pid: 11, ppid: 10, pgid: 11, started: "original" };

test("strict reaping rejects while a remembered process survives SIGKILL", async () => {
	const signals: string[] = [];
	const processes = new ForkAgentProcesses(10, {
		list: async () => [child],
		signal: (_target, signal) => {
			signals.push(signal);
		},
		wait: async () => {},
		confirmAttempts: 1,
	});
	await processes.sample({ strict: true });
	const closing = processes.reapAndConfirm();
	await expect(closing).rejects.toThrow("Agent processes did not stop: 11");
	expect(signals).toContain("SIGKILL");
	expect(processes.reapAndConfirm()).toBe(closing);
	await expect(processes.reapAndConfirm()).rejects.toThrow("did not stop");
});

test("strict reaping confirms a remembered process disappears after escalation", async () => {
	let rows = [child];
	const processes = new ForkAgentProcesses(10, {
		list: async () => rows,
		signal: (_target, signal) => {
			if (signal === "SIGKILL") rows = [];
		},
		wait: async () => {},
	});
	await processes.sample({ strict: true });
	await expect(processes.reapAndConfirm()).resolves.toBeUndefined();
});

test("a process table failure cannot confirm descendant termination", async () => {
	let reads = 0;
	const processes = new ForkAgentProcesses(10, {
		list: async () => {
			reads += 1;
			if (reads >= 4) throw new Error("process table unavailable");
			return [child];
		},
		signal: () => {},
		wait: async () => {},
	});
	await processes.sample({ strict: true });
	await expect(processes.reapAndConfirm()).rejects.toThrow(
		"process table unavailable",
	);
});

test("strict reaping does not wait for a reused pid", async () => {
	let rows = [child];
	const signals: number[] = [];
	const processes = new ForkAgentProcesses(10, {
		list: async () => rows,
		signal: (target) => {
			signals.push(target);
		},
		wait: async () => {},
	});
	await processes.sample({ strict: true });
	rows = [{ ...child, started: "replacement" }];
	await processes.reapAndConfirm();
	expect(signals).toEqual([]);
});
