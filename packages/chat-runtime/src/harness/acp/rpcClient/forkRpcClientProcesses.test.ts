import { expect, test } from "bun:test";
import { spawnAcpTransport } from "./rpcClient";

const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

test.skipIf(process.platform === "win32")(
	"closing an agent stops the background command it started in its own process group",
	async () => {
		let line = "";
		const transport = spawnAcpTransport(
			{
				command: process.execPath,
				args: [
					"-e",
					`const c=require("node:child_process").spawn("sleep",["30"],{detached:true,stdio:"ignore"});c.unref();console.log(c.pid);process.stdin.on("end",()=>process.exit(0));process.stdin.resume();`,
				],
			},
			{
				onLine: (value) => {
					line = value;
				},
				onStderr: () => {},
				onExit: () => {},
			},
		);
		while (!line) await Bun.sleep(20);
		const background = Number(line);
		expect(alive(background)).toBe(true);
		await transport.close();
		expect(alive(background)).toBe(false);
	},
);
