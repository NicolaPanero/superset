import { type ChildProcess, spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export interface ForkInstallAsset {
	tag: string;
	url: string;
	sha256: string;
}
export function forkInstallAsset(
	body: unknown,
	repository: string,
	platform: NodeJS.Platform = process.platform,
): ForkInstallAsset {
	if (!body || typeof body !== "object")
		throw new Error("Invalid fork release");
	const release = body as { tag_name?: unknown; assets?: unknown };
	const tag = release.tag_name;
	if (
		typeof tag !== "string" ||
		!/^desktop-v[\w.+-]+$/.test(tag) ||
		!Array.isArray(release.assets)
	)
		throw new Error("Invalid fork release");
	const name =
		platform === "win32" ? "Superset-fork-x64.exe" : "Superset-fork-arm64.zip";
	const asset = release.assets.find(
		(entry: { name?: unknown }) => entry?.name === name,
	);
	const expected = `https://github.com/${repository}/releases/download/${tag}/${name}`;
	if (
		!asset ||
		asset.browser_download_url !== expected ||
		typeof asset.digest !== "string" ||
		!/^sha256:[a-f0-9]{64}$/.test(asset.digest)
	)
		throw new Error("Fork update archive or checksum unavailable");
	return { tag, url: expected, sha256: asset.digest.slice(7) };
}
export function installedForkAppPath(executable: string) {
	const path = dirname(dirname(dirname(executable)));
	if (!["Superset++.app", "Paradev++.app"].includes(basename(path)))
		throw new Error("Unexpected fork app installation path");
	return path;
}
interface InstallerWait {
	readStatus: () => string;
	subscribe: (failed: (error: Error) => void) => () => void;
	poll: (callback: () => void) => () => void;
	deadline: (callback: () => void) => () => void;
	cancel: () => void;
	signal: AbortSignal;
}
export function waitForForkInstaller(deps: InstallerWait): Promise<void> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const cleanup: (() => void)[] = [];
		const finish = (error?: Error) => {
			if (settled) return;
			settled = true;
			for (const dispose of cleanup) dispose();
			if (error) {
				deps.cancel();
				reject(error);
			} else resolve();
		};
		const abort = () =>
			finish(new Error("Update cancelled", { cause: deps.signal.reason }));
		if (deps.signal.aborted) {
			abort();
			return;
		}
		deps.signal.addEventListener("abort", abort, { once: true });
		cleanup.push(() => deps.signal.removeEventListener("abort", abort));
		const read = () => {
			try {
				const status = deps.readStatus();
				if (status === "ready") finish();
				else if (status === "failed")
					finish(new Error("Fork installer failed; see update log"));
			} catch (error) {
				finish(error instanceof Error ? error : new Error(String(error)));
			}
		};
		cleanup.push(deps.subscribe((error) => finish(error)));
		cleanup.push(deps.poll(read));
		cleanup.push(
			deps.deadline(() =>
				finish(new Error("Fork update preparation timed out")),
			),
		);
		read();
	});
}
export async function prepareForkInstaller(options: {
	asset: ForkInstallAsset;
	scriptPath: string;
	appPath: string;
	statePath: string;
	logPath: string;
	signal: AbortSignal;
	parentPid: number;
}): Promise<void> {
	mkdirSync(options.statePath, { recursive: true, mode: 0o700 });
	mkdirSync(dirname(options.logPath), { recursive: true });
	const statusPath = join(options.statePath, "status");
	rmSync(statusPath, { force: true });
	const output = openSync(options.logPath, "w", 0o600);
	let child: ChildProcess;
	try {
		child = spawn(
			"/bin/sh",
			[
				options.scriptPath,
				"--wait-pid",
				String(options.parentPid),
				"--relaunch",
				"--status-file",
				statusPath,
				"--app-path",
				options.appPath,
				"--download-url",
				options.asset.url,
				"--sha256",
				options.asset.sha256,
			],
			{
				cwd: options.statePath,
				detached: true,
				stdio: ["ignore", output, output],
			},
		);
	} finally {
		closeSync(output);
	}
	await waitForForkInstaller({
		readStatus() {
			try {
				return readFileSync(statusPath, "utf8").trim();
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
				throw error;
			}
		},
		subscribe(failed) {
			const onError = (error: Error) => failed(error);
			const onExit = (code: number | null) =>
				failed(new Error(`Fork installer exited before restart (${code})`));
			child.on("error", onError);
			child.on("exit", onExit);
			return () => {
				child.removeListener("error", onError);
				child.removeListener("exit", onExit);
			};
		},
		poll(callback) {
			const timer = setInterval(callback, 100);
			return () => clearInterval(timer);
		},
		deadline(callback) {
			const timer = setTimeout(callback, 16 * 60_000);
			return () => clearTimeout(timer);
		},
		cancel() {
			if (child.pid && child.exitCode === null && child.signalCode === null) {
				try {
					process.kill(-child.pid, "SIGTERM");
				} catch {
					child.kill("SIGTERM");
				}
			}
		},
		signal: options.signal,
	});
	child.unref();
}

export async function restartPreparedForkUpdate(deps: {
	prepare: () => Promise<void>;
	signal: AbortSignal;
	restart: () => void;
	forceExit: () => void;
	scheduleExit: (callback: () => void, delay: number) => void;
}) {
	await deps.prepare();
	deps.signal.throwIfAborted();
	deps.scheduleExit(deps.forceExit, 15_000);
	deps.restart();
}
