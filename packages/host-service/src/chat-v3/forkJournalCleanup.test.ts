import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatDb } from "@superset/chat-runtime";
import { pruneSessionEventsOnce } from "./forkJournalCleanup";

const folders: string[] = [];
afterEach(() => {
	for (const folder of folders.splice(0))
		rmSync(folder, { recursive: true, force: true });
});
const folder = () => {
	const path = mkdtempSync(join(tmpdir(), "fork-journal-cleanup-"));
	folders.push(path);
	return path;
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
const db = {} as ChatDb;

test("stored session events are cleaned once per chat database", async () => {
	const dataDir = folder();
	let runs = 0;
	const prune = async () => {
		runs++;
		return 3;
	};
	pruneSessionEventsOnce(db, dataDir, prune, 0);
	await settle();
	expect(runs).toBe(1);
	expect(existsSync(join(dataDir, "fork-session-events-pruned-v1"))).toBe(true);
	pruneSessionEventsOnce(db, dataDir, prune, 0);
	await settle();
	expect(runs).toBe(1);
});

test("a failed cleanup runs again on the next start", async () => {
	const dataDir = folder();
	let runs = 0;
	const failing = async () => {
		runs++;
		throw new Error("busy");
	};
	pruneSessionEventsOnce(db, dataDir, failing, 0);
	await settle();
	expect(existsSync(join(dataDir, "fork-session-events-pruned-v1"))).toBe(
		false,
	);
	writeFileSync(join(dataDir, "unrelated"), "");
	pruneSessionEventsOnce(db, dataDir, failing, 0);
	await settle();
	expect(runs).toBe(2);
});
