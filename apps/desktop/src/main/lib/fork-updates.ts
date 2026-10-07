import { spawn } from "node:child_process";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { app, dialog } from "electron";
import log from "electron-log/main";
import { env } from "main/env.main";
import { setSkipQuitConfirmation } from "main/index";
import { newerForkRelease } from "./fork-release";

// Set when the fork's release workflow builds the app.
const FORK_RELEASE = process.env.SUPERSET_FORK_RELEASE ?? "";
const FORK_REPOSITORY = process.env.SUPERSET_FORK_REPOSITORY ?? "";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 60 * 1000;

let offered: string | null = null;

async function latestRelease(): Promise<string | undefined> {
	const response = await fetch(
		`https://api.github.com/repos/${FORK_REPOSITORY}/releases/latest`,
		{ headers: { Accept: "application/vnd.github+json" } },
	);
	if (!response.ok) return undefined;
	const body = (await response.json()) as { tag_name?: unknown };
	return typeof body.tag_name === "string" ? body.tag_name : undefined;
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

async function check(): Promise<void> {
	const tag = newerForkRelease(
		FORK_RELEASE,
		await latestRelease().catch(() => undefined),
	);
	if (!tag || tag === offered) return;
	offered = tag;
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

/** Offers this fork's newer GitHub releases; official updates are off in fork builds. */
export function setupForkUpdates(): void {
	if (
		env.NODE_ENV === "development" ||
		process.platform !== "darwin" ||
		!FORK_RELEASE ||
		!FORK_REPOSITORY
	)
		return;
	const run = () =>
		void check().catch((error) =>
			log.warn("[fork-updates] check failed", error),
		);
	setTimeout(run, FIRST_CHECK_DELAY_MS);
	setInterval(run, CHECK_INTERVAL_MS);
}
