import { expect, test } from "bun:test";
import { runNativeProbe } from "./windows-native-smoke";

test("a successful native probe with redirected output reports its actual zero exit code", async () => {
	const result = await runNativeProbe([
		process.execPath,
		"-e",
		'console.log("Native modules OK"); console.error("diagnostic"); process.exit(0)',
	]);
	expect(result).toEqual({
		code: 0,
		stdout: "Native modules OK\n",
		stderr: "diagnostic\n",
		timedOut: false,
	});
});
test("printing OK cannot hide a real native process failure", async () => {
	const result = await runNativeProbe([
		process.execPath,
		"-e",
		'console.log("Native modules OK"); process.exit(17)',
	]);
	expect(result.code).toBe(17);
	expect(result.stdout).toContain("Native modules OK");
	expect(result.timedOut).toBe(false);
});
test("a native probe that hangs is stopped within its injected timeout", async () => {
	const result = await runNativeProbe(
		[process.execPath, "-e", "setInterval(() => {}, 1000)"],
		{ timeoutMs: 20 },
	);
	expect(result.timedOut).toBe(true);
	expect(result.code).not.toBe(0);
});
