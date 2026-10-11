import { spawn } from "node:child_process";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { app, dialog } from "electron";
import log from "electron-log/main";
import { env } from "main/env.main";
import { setSkipQuitConfirmation } from "main/index";
import { createForkUpdateCheck } from "./fork-update-check";

// Set when the fork's release workflow builds the app.
const FORK_RELEASE = process.env.SUPERSET_FORK_RELEASE ?? "";
const FORK_REPOSITORY = process.env.SUPERSET_FORK_REPOSITORY ?? "";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 60 * 1000;

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
	const body = (await response.json()) as { tag_name?: unknown };
	if (
		typeof body.tag_name !== "string" ||
		!body.tag_name.startsWith("desktop-v")
	) {
		throw new Error("Fork release check: invalid desktop release");
	}
	return body.tag_name;
}

function installAndRestart(): void {
	const script = `https://raw.githubusercontent.com/${FORK_REPOSITORY}/fork/main/scripts/fork/install.sh`;
	spawn(
		"/bin/sh",
		[
			"-c",
			`curl -fsSL "${script}" | sh -s -- --wait-pid ${process.pid} --relaunch`,
		],
		{ detached: true, stdio: "ignore" },
	).unref();
	setSkipQuitConfirmation();
	app.quit();
}

async function offerUpdate(tag: string): Promise<void> {
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
	if (response === 0) installAndRestart();
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
	setTimeout(runCheck, FIRST_CHECK_DELAY_MS);
	setInterval(runCheck, CHECK_INTERVAL_MS);
}
