import { join } from "node:path";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { app, dialog } from "electron";
import log from "electron-log/main";
import { env } from "main/env.main";
import { exitImmediately, setSkipQuitConfirmation } from "main/index";
import { createForkUpdateCheck } from "./fork-update-check";
import {
	type ForkInstallAsset,
	forkInstallAsset,
	installedForkAppPath,
	prepareForkInstaller,
	restartPreparedForkUpdate,
} from "./fork-update-install";
import { showForkUpdateProgress } from "./fork-update-progress";

// Set when the fork's release workflow builds the app.
const FORK_RELEASE = process.env.SUPERSET_FORK_RELEASE ?? "";
const FORK_REPOSITORY = process.env.SUPERSET_FORK_REPOSITORY ?? "";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 60 * 1000;

let availableAsset: ForkInstallAsset | undefined;
let installing: Promise<boolean> | undefined;

async function latestRelease(): Promise<string> {
	const response = await fetch(
		`https://api.github.com/repos/${FORK_REPOSITORY}/releases/latest`,
		{
			headers: { Accept: "application/vnd.github+json" },
			signal: AbortSignal.timeout(15_000),
		},
	);
	if (!response.ok)
		throw new Error(`Fork release check: HTTP ${response.status}`);
	availableAsset = forkInstallAsset(await response.json(), FORK_REPOSITORY);
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
					prepareForkInstaller({
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
					setSkipQuitConfirmation();
					app.quit();
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
	offer: offerUpdate,
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
		process.platform === "darwin" &&
		Boolean(FORK_RELEASE && FORK_REPOSITORY)
	);
}

function runCheck(interactive = false): void {
	void check(interactive).catch((error) =>
		log.warn("[fork-updates] dialog failed", error),
	);
}

export function checkForForkUpdatesInteractive(): boolean {
	if (!canCheckForkUpdates()) return false;
	runCheck(true);
	return true;
}

/** Offers this fork's newer GitHub releases; official updates are off in fork builds. */
export function setupForkUpdates(): void {
	if (!canCheckForkUpdates()) return;
	log.info("[fork-updates] automatic checks enabled", FORK_RELEASE);
	setTimeout(runCheck, FIRST_CHECK_DELAY_MS);
	setInterval(runCheck, CHECK_INTERVAL_MS);
}
