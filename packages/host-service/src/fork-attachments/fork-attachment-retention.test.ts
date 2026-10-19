import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	statSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WORKSPACE_ATTACHMENTS_DIR } from "@superset/shared/workspace-attachments";
import {
	DEFAULT_ATTACHMENT_RETENTION_DAYS,
	readAttachmentRetentionDays,
	sweepAttachmentDirectories,
	touchAttachment,
	writeAttachmentRetentionDays,
} from "./fork-attachment-retention";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 19);
let root: string;

function attachment(workspace: string, name: string, ageDays: number) {
	const directory = join(root, workspace, WORKSPACE_ATTACHMENTS_DIR);
	mkdirSync(directory, { recursive: true });
	const path = join(directory, name);
	writeFileSync(path, "1234");
	const time = new Date(NOW - ageDays * DAY_MS);
	utimesSync(path, time, time);
	return path;
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "fork-attachments-"));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("attachment retention", () => {
	test("deletes only files older than the retention period", () => {
		const old = attachment("a", "image.png", 31);
		const recent = attachment("a", "image_1.png", 29);
		const ignore = attachment("a", ".gitignore", 400);
		const otherOld = attachment("b", "image-0123456789ab.png", 90);

		const result = sweepAttachmentDirectories(
			[join(root, "a"), join(root, "b"), join(root, "a"), join(root, "none")],
			30,
			NOW,
		);

		expect(result).toEqual({ deleted: 2, freedBytes: 8 });
		expect(existsSync(old)).toBe(false);
		expect(existsSync(otherOld)).toBe(false);
		expect(existsSync(recent)).toBe(true);
		expect(existsSync(ignore)).toBe(true);
	});

	test("zero days never deletes", () => {
		const old = attachment("a", "image.png", 4000);
		expect(sweepAttachmentDirectories([join(root, "a")], 0, NOW)).toEqual({
			deleted: 0,
			freedBytes: 0,
		});
		expect(existsSync(old)).toBe(true);
	});

	test("a reused attachment restarts its period", () => {
		const reused = attachment("a", "image-0123456789ab.png", 60);
		touchAttachment(reused, new Date(NOW));
		sweepAttachmentDirectories([join(root, "a")], 30, NOW);
		expect(statSync(reused).mtimeMs).toBe(NOW);
	});

	test("stores the period and falls back to 30 days", () => {
		const path = join(root, "fork", "attachment-retention.json");
		expect(readAttachmentRetentionDays(path)).toBe(
			DEFAULT_ATTACHMENT_RETENTION_DAYS,
		);
		writeAttachmentRetentionDays(7, path);
		expect(readAttachmentRetentionDays(path)).toBe(7);
		writeFileSync(path, "{broken");
		expect(readAttachmentRetentionDays(path)).toBe(30);
		expect(() => writeAttachmentRetentionDays(-1, path)).toThrow();
	});
});
