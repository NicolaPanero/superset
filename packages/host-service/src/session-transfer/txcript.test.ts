import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHelper, txcriptHelperPath } from "./txcript";

describe("conversion helper lifecycle", () => {
	it("runs native import in the requested workspace directory", async () => {
		const directory = await mkdtemp(join(tmpdir(), "transfer-cwd-"));
		try {
			const result = await runHelper(
				process.execPath,
				["-e", "console.log(JSON.stringify({cwd:process.cwd()}))"],
				undefined,
				undefined,
				{ cwd: directory },
			);
			expect(result).toEqual({
				cwd: await import("node:fs/promises").then(({ realpath }) =>
					realpath(directory),
				),
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
	it("reports fixed errors without exposing helper stderr", async () => {
		await expect(
			runHelper(process.execPath, [
				"-e",
				"console.error('private-fixture-detail');process.exit(1)",
			]),
		).rejects.toThrow("conversion_failed");
		await expect(runHelper("/missing/native/helper", [])).rejects.toThrow(
			"helper_unavailable",
		);
	});
	it("bounds output and preserves Unicode JSON", async () => {
		expect(
			await runHelper(process.execPath, [
				"-e",
				"console.log(JSON.stringify({text:'cronologia 日本語'}))",
			]),
		).toEqual({ text: "cronologia 日本語" });
		await expect(
			runHelper(process.execPath, [
				"-e",
				"process.stdout.write('x'.repeat(1024*1024+1));setInterval(()=>{},1000)",
			]),
		).rejects.toThrow("helper_output_too_large");
	});
	it("cancels the helper and its import child as one process group", async () => {
		if (process.platform === "win32") return;
		const directory = await mkdtemp(join(tmpdir(), "transfer-cancel-"));
		const pidFile = join(directory, "child-pid");
		const controller = new AbortController();
		const script = `const {spawn}=require('node:child_process');const {writeFileSync}=require('node:fs');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'});writeFileSync(${JSON.stringify(pidFile)},String(child.pid));setInterval(()=>{},1000);`;
		const pending = runHelper(
			process.execPath,
			["-e", script],
			undefined,
			controller.signal,
		);
		try {
			let childPid = 0;
			for (let i = 0; i < 100 && !childPid; i++) {
				try {
					childPid = Number(await readFile(pidFile, "utf8"));
				} catch {}
				if (!childPid) await Bun.sleep(10);
			}
			expect(childPid).toBeGreaterThan(0);
			controller.abort();
			await expect(pending).rejects.toThrow("transfer_cancelled");
			let alive = true;
			for (let i = 0; i < 100 && alive; i++) {
				try {
					process.kill(childPid, 0);
				} catch {
					alive = false;
				}
				if (alive) await Bun.sleep(20);
			}
			expect(alive).toBe(false);
		} finally {
			controller.abort();
			await rm(directory, { recursive: true, force: true });
		}
	});
});

describe("txcriptHelperPath", () => {
	it("prefers the helper in the app bundle and falls back to the Superset home", () => {
		const exec = "/Applications/Superset.app/Contents/MacOS/Superset";
		const bundled =
			"/Applications/Superset.app/Contents/Resources/resources/bin/txcript-transfer";
		expect(txcriptHelperPath(exec, (path) => path === bundled)).toBe(bundled);
		expect(txcriptHelperPath(exec, () => false)).toEndWith(
			"/bin/txcript-transfer",
		);
		expect(txcriptHelperPath(exec, () => false)).not.toBe(bundled);
	});
});
