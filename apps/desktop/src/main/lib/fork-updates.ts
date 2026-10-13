import { join } from "node:path";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { app, dialog, powerMonitor } from "electron";
import log from "electron-log/main";
import { env } from "main/env.main";
import {
	exitImmediately,
	quitAppCompletely,
	setSkipQuitConfirmation,
} from "main/index";
import { createForkReleaseLookup } from "./fork-release-lookup";
import { createForkUpdateCheck } from "./fork-update-check";
import {
	type ForkInstallAsset,
	installedForkAppPath,
	prepareForkInstaller,
	restartPreparedForkUpdate,
} from "./fork-update-install";
import { forkUpdateNotices } from "./fork-update-notices";
import { showForkUpdateProgress } from "./fork-update-progress";
import { scheduleForkUpdateChecks } from "./fork-update-schedule";
import { prepareWindowsForkInstaller } from "./fork-windows-update";

// Set when the fork's release workflow builds the app.
const FORK_RELEASE = process.env.SUPERSET_FORK_RELEASE ?? "";
const FORK_REPOSITORY = process.env.SUPERSET_FORK_REPOSITORY ?? "";

let availableAsset: ForkInstallAsset | undefined;
let installing: Promise<boolean> | undefined;

const lookupRelease = createForkReleaseLookup({ repository: FORK_REPOSITORY });
async function latestRelease(): Promise<string> {
	availableAsset = await lookupRelease();
	return availableAsset.tag;
}

function installAndRestart(tag: string): Promise<boolean> {
	if (installing) return installing;
	installing = (async () => {
		const abort = new AbortController();
		const logPath = join(app.getPath("logs"), "fork-update.log");
		let progress:
			| Awaited<ReturnType<typeof showForkUpdateProgress>>
			| undefined;
		try {
			if (availableAsset?.tag !== tag)
				throw new Error("Fork release changed; check again");
			const asset = availableAsset;
			progress = await showForkUpdateProgress(() => abort.abort());
			await restartPreparedForkUpdate({
				signal: abort.signal,
				prepare: () =>
					process.platform === "win32"
						? prepareWindowsForkInstaller({
								asset,
								scriptPath: join(
									process.resourcesPath,
									"resources/fork/install-windows.ps1",
								),
								executable: process.execPath,
								statePath: join(app.getPath("userData"), "fork-update"),
								logPath,
								signal: abort.signal,
								parentPid: process.pid,
							})
						: prepareForkInstaller({
								asset,
								scriptPath: join(
									process.resourcesPath,
									"resources/fork/install.sh",
								),
								appPath: installedForkAppPath(process.execPath),
								statePath: join(app.getPath("userData"), "fork-update"),
								logPath,
								signal: abort.signal,
								parentPid: process.pid,
							}),
				restart() {
					progress?.close();
					log.info("[fork-updates] installer ready; restarting", tag);
					if (process.platform === "win32") quitAppCompletely();
					else {
						setSkipQuitConfirmation();
						app.quit();
					}
				},
				forceExit: exitImmediately,
				scheduleExit(callback, delay) {
					setTimeout(callback, delay).unref();
				},
			});
			return true;
		} catch (error) {
			progress?.close();
			if (!abort.signal.aborted) {
				log.error("[fork-updates] installation failed", error);
				await dialog.showMessageBox({
					type: "error",
					title: i18n._(msg({ message: "Update Error" })),
					message: i18n._(
						msg({
							message:
								"Could not install the update. Superset++ is still open. Try again from Check for Updates.",
						}),
					),
					detail: logPath,
				});
			}
			return false;
		}
	})().finally(() => {
		installing = undefined;
	});
	return installing;
}

async function offerUpdate(tag: string): Promise<boolean> {
	const { response } = await dialog.showMessageBox({
		type: "info",
		title: i18n._(msg({ message: "Update available" })),
		message: i18n._(
			msg({ message: "A new build of this Superset fork is available." }),
		),
		detail: i18n._({
			...msg({
				message:
					"Installed: {installed}. Latest: {latest}. Settings and data are kept.",
			}),
			values: { installed: FORK_RELEASE, latest: tag },
		}),
		buttons: [
			i18n._(msg({ message: "Install and restart" })),
			i18n._(msg({ message: "Later" })),
		],
		defaultId: 0,
		cancelId: 1,
	});
	return response === 0 ? installAndRestart(tag) : true;
}

const check = createForkUpdateCheck({
	installed: FORK_RELEASE,
	latestRelease,
	async offer(tag, interactive) {
		if (interactive) {
			forkUpdateNotices.dismiss(forkUpdateNotices.get()?.tag ?? tag);
			return offerUpdate(tag);
		}
		forkUpdateNotices.publish({ tag, installed: FORK_RELEASE });
		return true;
	},
	async upToDate() {
		await dialog.showMessageBox({
			type: "info",
			title: i18n._(msg({ message: "No Updates" })),
			message: i18n._(msg({ message: "You're up to date!" })),
			detail: i18n._({
				...msg({ message: "Version {version} is the latest version." }),
				values: { version: FORK_RELEASE },
			}),
		});
	},
	async failed(error, interactive) {
		log.warn("[fork-updates] check failed", error);
		if (interactive) {
			await dialog.showMessageBox({
				type: "error",
				title: i18n._(msg({ message: "Update Error" })),
				message: i18n._(
					msg({
						message: "Failed to check for updates. Please try again later.",
					}),
				),
			});
		}
	},
});

function canCheckForkUpdates(): boolean {
	return (
		env.NODE_ENV !== "development" &&
		((process.platform === "darwin" && process.arch === "arm64") ||
			(process.platform === "win32" && process.arch === "x64")) &&
		Boolean(FORK_RELEASE && FORK_REPOSITORY)
	);
}

function runCheck(interactive = false): void {
	if (installing) return;
	void check(interactive).catch((error) =>
		log.warn("[fork-updates] dialog failed", error),
	);
}

export function checkForForkUpdatesInteractive(): boolean {
	if (!canCheckForkUpdates()) return false;
	runCheck(true);
	return true;
}

export async function installAvailableForkUpdate(
	tag: string,
): Promise<boolean> {
	if (!canCheckForkUpdates() || availableAsset?.tag !== tag) return false;
	const installed = await installAndRestart(tag);
	if (installed) forkUpdateNotices.dismiss(tag);
	return installed;
}

/** Offers this fork's newer GitHub releases; official updates are off in fork builds. */
export function setupForkUpdates(): void {
	if (!canCheckForkUpdates()) return;
	log.info("[fork-updates] automatic checks enabled", FORK_RELEASE);
	const dispose = scheduleForkUpdateChecks({
		check: runCheck,
		now: Date.now,
		after(callback, delay) {
			const timer = setTimeout(callback, delay);
			timer.unref();
			return () => clearTimeout(timer);
		},
		every(callback, delay) {
			const timer = setInterval(callback, delay);
			timer.unref();
			return () => clearInterval(timer);
		},
		onFocus(callback) {
			app.on("browser-window-focus", callback);
			return () => {
				app.off("browser-window-focus", callback);
			};
		},
		onResume(callback) {
			powerMonitor.on("resume", callback);
			return () => {
				powerMonitor.off("resume", callback);
			};
		},
	});
	app.once("will-quit", dispose);
}
