import { expect, test } from "bun:test";
import { spawnCodexTransport } from "./rpcClient";

const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

test.skipIf(process.platform === "win32")(
	"a command the Codex agent started is stopped when the agent exits before it was ever sampled",
	async () => {
		let pid = 0;
		let exit: () => void = () => {};
		const exited = new Promise<void>((resolve) => {
			exit = resolve;
		});
		const script = `const c=require("node:child_process").spawn("sleep",["30"],{stdio:"ignore"});console.log(c.pid);setTimeout(()=>process.exit(1),20);`;
		const transport = spawnCodexTransport(
			{ command: process.execPath, args: ["-e", script] },
			{
				onLine: (line) => {
					pid = Number(line);
				},
				onStderr: () => {},
				onExit: () => exit(),
			},
		);
		await exited;
		await transport.close();
		for (let attempt = 0; attempt < 100 && alive(pid); attempt++)
			await Bun.sleep(10);
		expect(pid).toBeGreaterThan(0);
		expect(alive(pid)).toBe(false);
	},
);
