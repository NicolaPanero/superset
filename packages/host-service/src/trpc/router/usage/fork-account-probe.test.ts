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
	await claudeProbe("/test-only-probe", {}, 1000, spawn);
	expect(writes).toEqual(["/usage\r"]);
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
