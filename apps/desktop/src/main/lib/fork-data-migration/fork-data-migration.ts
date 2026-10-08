import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const MARKER = ".copied-from-superset";

/** Live state of the app that wrote these folders: never carried over. */
const SKIPPED_HOME = new Set([
	"worktrees",
	"auth-token.enc",
	"terminal-host.sock",
	"terminal-host.pid",
	"terminal-host.token",
	"manifest.json",
	"pty-daemon-manifest.json",
]);
const SKIPPED_PROFILE = new Set([
	"Cache",
	"Code Cache",
	"GPUCache",
	"Crashpad",
	"SingletonCookie",
	"SingletonLock",
	"SingletonSocket",
	"sentry",
]);

function skipped(path: string, names: Set<string>) {
	const name = basename(path);
	return (
		names.has(name) ||
		name.endsWith(".sock") ||
		name.endsWith(".pid") ||
		name.endsWith(".log")
	);
}

/**
 * The first launch of Superset Fork copies what the app used while it was
 * still named Superset: settings, workspaces, chats and layout. Worktrees
 * stay where they are, so the copied paths keep pointing at them. Sign-in is
 * not copied: its token is sealed to the other app's keychain entry.
 */
export function copyForkData({
	fromHome,
	toHome,
	fromProfile,
	toProfile,
}: {
	fromHome: string;
	toHome: string;
	fromProfile: string;
	toProfile: string;
}): boolean {
	if (existsSync(toHome) || !existsSync(fromHome)) return false;
	cpSync(fromHome, toHome, {
		recursive: true,
		filter: (source) => !skipped(source, SKIPPED_HOME),
	});
	if (existsSync(fromProfile) && !existsSync(toProfile))
		cpSync(fromProfile, toProfile, {
			recursive: true,
			filter: (source) => !skipped(source, SKIPPED_PROFILE),
		});
	mkdirSync(toHome, { recursive: true });
	writeFileSync(join(toHome, MARKER), `${fromHome}\n`);
	return true;
}

export function copyForkDataOnFirstLaunch(
	homeDirName: string,
	appData: string,
	productName: string,
) {
	if (homeDirName !== ".superset-fork" || process.env.SUPERSET_HOME_DIR) return;
	try {
		if (
			copyForkData({
				fromHome: join(homedir(), ".superset"),
				toHome: join(homedir(), homeDirName),
				fromProfile: join(appData, "Superset"),
				toProfile: join(appData, productName),
			})
		)
			console.log("[fork] Copied data from ~/.superset");
	} catch (error) {
		console.warn("[fork] Could not copy data from ~/.superset", error);
	}
}
