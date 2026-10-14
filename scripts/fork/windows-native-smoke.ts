import { writeFileSync } from "node:fs";
import { join } from "node:path";
export async function runNativeProbe(
	command: string[],
	options: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
) {
	const child = Bun.spawn(command, {
		stdout: "pipe",
		stderr: "pipe",
		env: options.env ?? process.env,
	});
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		if (process.platform === "win32")
			Bun.spawnSync(["taskkill.exe", "/PID", String(child.pid), "/T", "/F"], {
				stdout: "ignore",
				stderr: "ignore",
			});
		child.kill();
	}, options.timeoutMs ?? 60_000);
	try {
		const [code, stdout, stderr] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		]);
		return { code, stdout, stderr, timedOut };
	} finally {
		clearTimeout(timer);
	}
}
if (import.meta.main) {
	const [executable, probe, installation] = process.argv.slice(2);
	if (!executable || !probe || !installation)
		throw new Error(
			"Expected installed executable, native probe and installation directory",
		);
	const result = await runNativeProbe([executable, probe, installation]);
	if (process.env.RUNNER_TEMP) {
		writeFileSync(
			join(process.env.RUNNER_TEMP, "windows-native-stdout.log"),
			result.stdout,
		);
		writeFileSync(
			join(process.env.RUNNER_TEMP, "windows-native-stderr.log"),
			`${result.stderr}\nExit code: ${result.code}; timed out: ${result.timedOut}\n`,
		);
	}
	process.stdout.write(result.stdout);
	process.stderr.write(result.stderr);
	console.log(
		`Installed native probe exit code: ${result.code}${result.timedOut ? " (timed out)" : ""}`,
	);
	process.exit(result.timedOut ? 124 : result.code);
}
