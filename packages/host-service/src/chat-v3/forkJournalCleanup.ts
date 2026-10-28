import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type ChatDb, pruneStoredSessionEvents } from "@superset/chat-runtime";

const MARKER = "fork-session-events-pruned-v1";
const DELAY_MS = 30_000;

/**
 * Removes the session events that newer ones superseded, once per chat
 * database and in the background, after the host has settled.
 */
export function pruneSessionEventsOnce(
	db: ChatDb,
	dataDir: string,
	prune: (db: ChatDb) => Promise<number> = pruneStoredSessionEvents,
	delayMs = DELAY_MS,
): void {
	const marker = join(dataDir, MARKER);
	if (existsSync(marker)) return;
	const timer = setTimeout(() => {
		prune(db)
			.then((removed) => {
				writeFileSync(marker, `${new Date().toISOString()} ${removed}\n`);
				console.log(`[chat-v3] removed ${removed} superseded session events`);
			})
			.catch((error: unknown) => {
				console.warn("[chat-v3] session event cleanup failed:", error);
			});
	}, delayMs);
	timer.unref?.();
}
