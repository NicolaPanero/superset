import {
	cpSync,
	existsSync,
	mkdirSync,
	renameSync,
	writeFileSync,
} from "node:fs";
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

function skipped(path: string, names: Set<string>, logs: boolean) {
	const name = basename(path);
	return (
		names.has(name) ||
		name.endsWith(".sock") ||
		name.endsWith(".pid") ||
		(logs && name.endsWith(".log"))
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
	if (!existsSync(fromHome) || existsSync(join(toHome, MARKER))) return false;
	// A home holding a database has been used for real: never replace it.
	if (existsSync(join(toHome, "local.db"))) return false;
	const stamp = Date.now();
	// Folders an earlier launch created before this copy ran are kept aside.
	if (existsSync(toHome)) renameSync(toHome, `${toHome}.before-copy-${stamp}`);
	if (existsSync(toProfile))
		renameSync(toProfile, `${toProfile}.before-copy-${stamp}`);
	cpSync(fromHome, toHome, {
		recursive: true,
		filter: (source) => !skipped(source, SKIPPED_HOME, true),
	});
	if (existsSync(fromProfile))
		cpSync(fromProfile, toProfile, {
			recursive: true,
			// LevelDB keeps its newest writes in *.log files: they are data here.
			filter: (source) => !skipped(source, SKIPPED_PROFILE, false),
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
	if (homeDirName !== ".superset-fork") return;
	// Launched from Superset (its terminal, its updater), the fork inherits
	// the official home; that one is never the fork's.
	if (process.env.SUPERSET_HOME_DIR === join(homedir(), ".superset"))
		delete process.env.SUPERSET_HOME_DIR;
	if (process.env.SUPERSET_HOME_DIR) return;
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
