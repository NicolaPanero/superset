import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, createWriteStream, openSync, readFileSync } from "node:fs";
import {
	copyFile,
	mkdir,
	mkdtemp,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { dirname, join, win32 } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
	type ForkInstallAsset,
	waitForForkInstaller,
} from "./fork-update-install";

export function windowsForkApplication(executable: string) {
	if (
		!win32.isAbsolute(executable) ||
		win32.basename(executable).toLowerCase() !== "superset++.exe"
	)
		throw new Error("Unexpected fork app installation path");
	return { executable, directory: win32.dirname(executable) };
}
export async function downloadWindowsInstaller(
	asset: ForkInstallAsset,
	destination: string,
	signal: AbortSignal,
	request: (input: string, init: RequestInit) => Promise<Response> = fetch,
) {
	const partial = `${destination}.download`;
	try {
		const downloadSignal = AbortSignal.any([
			signal,
			AbortSignal.timeout(16 * 60_000),
		]);
		const response = await request(asset.url, { signal: downloadSignal });
		if (!response.ok || !response.body)
			throw new Error(`Windows update download: HTTP ${response.status}`);
		const maximum = 3 * 1024 * 1024 * 1024;
		if (Number(response.headers.get("content-length")) > maximum)
			throw new Error("Windows update exceeds download limit");
		const digest = createHash("sha256");
		let bytes = 0;
		const verify = new Transform({
			transform(chunk, _encoding, done) {
				bytes += chunk.length;
				if (bytes > maximum) {
					done(new Error("Windows update exceeds download limit"));
					return;
				}
				digest.update(chunk);
				done(null, chunk);
			},
		});
		await pipeline(
			Readable.fromWeb(
				response.body as unknown as Parameters<typeof Readable.fromWeb>[0],
			),
			verify,
			createWriteStream(partial),
			{ signal: downloadSignal },
		);
		if (digest.digest("hex") !== asset.sha256)
			throw new Error("Windows update checksum mismatch");
		signal.throwIfAborted();
		await rename(partial, destination);
	} finally {
		await rm(partial, { force: true });
	}
}
export async function prepareWindowsForkInstaller(options: {
	asset: ForkInstallAsset;
	scriptPath: string;
	executable: string;
	statePath: string;
	logPath: string;
	signal: AbortSignal;
	parentPid: number;
}) {
	const app = windowsForkApplication(options.executable);
	await mkdir(options.statePath, { recursive: true });
	await mkdir(dirname(options.logPath), { recursive: true });
	const work = await mkdtemp(join(options.statePath, "windows-"));
	const installer = join(work, "setup.exe");
	const script = join(work, "install.ps1");
	const status = join(work, "status");
	const manifest = join(work, "update.json");
	try {
		await downloadWindowsInstaller(options.asset, installer, options.signal);
		await copyFile(options.scriptPath, script);
		await writeFile(
			manifest,
			JSON.stringify({
				...app,
				installer,
				status,
				parentPid: options.parentPid,
				log: options.logPath,
				work,
				sha256: options.asset.sha256,
			}),
		);
		options.signal.throwIfAborted();
		const output = openSync(options.logPath, "w");
		const command = join(
			process.env.SystemRoot || "C:\\Windows",
			"System32",
			"WindowsPowerShell",
			"v1.0",
			"powershell.exe",
		);
		const child = (() => {
			try {
				return spawn(
					command,
					[
						"-NoProfile",
						"-NonInteractive",
						"-ExecutionPolicy",
						"Bypass",
						"-File",
						script,
						"-ManifestPath",
						manifest,
					],
					{
						detached: true,
						windowsHide: true,
						stdio: ["ignore", output, output],
					},
				);
			} finally {
				closeSync(output);
			}
		})();
		const cancel = () => {
			child.kill();
		};
		options.signal.addEventListener("abort", cancel, { once: true });
		child.once("exit", () =>
			options.signal.removeEventListener("abort", cancel),
		);
		await waitForForkInstaller({
			signal: options.signal,
			readStatus: () => {
				try {
					return readFileSync(status, "utf8").trim();
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
					throw error;
				}
			},
			subscribe: (failed) => {
				const error = (e: Error) => failed(e);
				const exit = (code: number | null) =>
					failed(new Error(`Windows updater exited before restart (${code})`));
				child.on("error", error);
				child.on("exit", exit);
				return () => {
					child.off("error", error);
					child.off("exit", exit);
				};
			},
			poll: (callback) => {
				const timer = setInterval(callback, 100);
				return () => clearInterval(timer);
			},
			deadline: (callback) => {
				const timer = setTimeout(callback, 60_000);
				return () => clearTimeout(timer);
			},
			cancel,
		});
		child.unref();
	} catch (error) {
		await rm(work, {
			recursive: true,
			force: true,
			maxRetries: 5,
			retryDelay: 100,
		});
		throw error;
	}
}
