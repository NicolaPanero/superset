import { expect, test } from "bun:test";
import type { spawn as NativeSpawn } from "node-pty";
import { claudeProbe, withProbeSlot } from "./fork-account-probe";

test("Claude recovery sends only the usage command with hooks and MCP disabled", async () => {
	const writes: string[] = [];
	let args: string[] = [];
	let onData: ((chunk: string) => void) | undefined;
	const spawn = ((_command: string, argv: string[]) => {
		args = argv;
		queueMicrotask(() => onData?.("for shortcuts"));
		return {
			onData: (fn: typeof onData) => {
				onData = fn;
			},
			onExit: () => {},
			kill: () => {},
			write: (value: string) => {
				writes.push(value);
				queueMicrotask(() => onData?.("Current session: 42%"));
			},
		};
	}) as unknown as typeof NativeSpawn;
	await claudeProbe("/test-only-probe", {}, 1000, spawn, 0);
	expect(writes).toEqual(["/usage\r"]);
	expect(args).not.toContain("--no-session-persistence");
	expect(args).not.toContain("--print");
	expect(args).toContain("--strict-mcp-config");
	expect(args).toContain('{"mcpServers":{}}');
	expect(args).toContain(
		'{"disableAllHooks":true,"remoteControlAtStartup":false,"autoUpdates":false}',
	);
});
test("only two recovery operations run at once", async () => {
	let running = 0,
		peak = 0;
	const releases: Array<() => void> = [];
	const run = () =>
		withProbeSlot(async () => {
			running++;
			peak = Math.max(peak, running);
			await new Promise<void>((resolve) => releases.push(resolve));
			running--;
		});
	const a = run(),
		b = run(),
		c = run();
	expect(running).toBe(2);
	releases.shift()?.();
	await a;
	expect(running).toBe(2);
	releases.shift()?.();
	releases.shift()?.();
	await Promise.all([b, c]);
	expect(peak).toBe(2);
});

test("Claude recovery handles the current trust screen without sending a model prompt", async () => {
	const writes: string[] = [];
	let onData: ((chunk: string) => void) | undefined;
	const spawn = (() => {
		queueMicrotask(() => onData?.("❯No,exit\r\nYes,Itrustthisfolder"));
		return {
			onData: (fn: typeof onData) => {
				onData = fn;
			},
			onExit: () => {},
			kill: () => {},
			write: (value: string) => {
				writes.push(value);
				queueMicrotask(() =>
					onData?.(
						value === "\x1b[B\r" ? "?forshortcuts" : "Currentsession:42%",
					),
				);
			},
		};
	}) as unknown as typeof NativeSpawn;
	await claudeProbe("/test-only-probe", {}, 1000, spawn, 0);
	expect(writes).toEqual(["\x1b[B\r", "/usage\r"]);
});

function probeFixture(failure?: "kill" | "write" | "login") {
	const launches: string[][] = [];
	const kills: Array<string | undefined> = [];
	const spawn = ((_command: string, args: string[]) => {
		launches.push(args);
		let onData: ((chunk: string) => void) | undefined;
		queueMicrotask(() =>
			onData?.(failure === "login" ? "Please login" : "for shortcuts"),
		);
		return {
			onData: (fn: typeof onData) => {
				onData = fn;
			},
			onExit: () => {},
			kill: (signal?: string) => {
				kills.push(signal);
				if (failure === "kill" || failure === "login")
					throw new Error("kill failed");
			},
			write: () => {
				if (failure === "write") throw new Error("write failed");
				queueMicrotask(() => onData?.("Current session: 42%"));
			},
		};
	}) as unknown as typeof NativeSpawn;
	return { spawn, launches, kills };
}

test("a throwing PTY shutdown settles the probe and releases its queued recovery slot", async () => {
	const f = probeFixture("kill");
	const jobs = Array.from({ length: 3 }, () =>
		withProbeSlot(() => claudeProbe("/test-only-probe", {}, 1000, f.spawn, 0)),
	);
	expect(f.launches).toHaveLength(2);
	const results = await Promise.allSettled(jobs);
	expect(
		results.every(
			(result) =>
				result.status === "rejected" &&
				result.reason.message === "probe_exited",
		),
	).toBe(true);
	expect(f.launches).toHaveLength(3);
	expect(f.kills).toEqual(["SIGKILL", "SIGKILL", "SIGKILL"]);
	await expect(withProbeSlot(async () => "released")).resolves.toBe("released");
});

test("a throwing PTY shutdown keeps the login-required result", async () => {
	const f = probeFixture("login");
	await expect(
		claudeProbe("/test-only-probe", {}, 1000, f.spawn, 0),
	).rejects.toThrow("probe_login_required");
	expect(f.kills).toEqual(["SIGKILL"]);
});

test("a PTY write failure settles the probe and shuts the process down", async () => {
	const f = probeFixture("write");
	await expect(
		claudeProbe("/test-only-probe", {}, 1000, f.spawn, 0),
	).rejects.toThrow("probe_exited");
	expect(f.kills).toEqual(["SIGKILL"]);
});
