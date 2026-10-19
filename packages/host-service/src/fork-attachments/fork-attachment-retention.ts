import {
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	statSync,
	unlinkSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { resolveSupersetHomeDir } from "@superset/agent-setup";
import { WORKSPACE_ATTACHMENTS_DIR } from "@superset/shared/workspace-attachments";
import { z } from "zod";
import type { HostDb } from "../db";
import { projects, workspaces } from "../db/schema";

export const DEFAULT_ATTACHMENT_RETENTION_DAYS = 30;
export const MAX_ATTACHMENT_RETENTION_DAYS = 3650;
const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_SWEEP_DELAY_MS = 60_000;

const retentionFile = z.object({
	days: z.number().int().min(0).max(MAX_ATTACHMENT_RETENTION_DAYS),
});

export function attachmentRetentionPath(home = resolveSupersetHomeDir()) {
	return join(home, "fork", "attachment-retention.json");
}

export function readAttachmentRetentionDays(
	path = attachmentRetentionPath(),
): number {
	try {
		return retentionFile.parse(JSON.parse(readFileSync(path, "utf8"))).days;
	} catch {
		return DEFAULT_ATTACHMENT_RETENTION_DAYS;
	}
}

export function writeAttachmentRetentionDays(
	days: number,
	path = attachmentRetentionPath(),
): void {
	const value = retentionFile.parse({ days });
	mkdirSync(dirname(path), { recursive: true });
	const temporary = `${path}.${process.pid}.tmp`;
	writeFileSync(temporary, `${JSON.stringify(value)}\n`);
	renameSync(temporary, path);
}

/** A reused attachment restarts its retention period. */
export function touchAttachment(path: string, now = new Date()): void {
	try {
		utimesSync(path, now, now);
	} catch {}
}

export interface AttachmentSweepResult {
	deleted: number;
	freedBytes: number;
}

/** `.gitignore` keeps the folder out of git status, so it is never swept. */
export function sweepAttachmentDirectories(
	roots: Iterable<string>,
	days: number,
	now = Date.now(),
): AttachmentSweepResult {
	const result: AttachmentSweepResult = { deleted: 0, freedBytes: 0 };
	if (days <= 0) return result;
	const cutoff = now - days * DAY_MS;
	for (const root of new Set(roots)) {
		const directory = join(root, WORKSPACE_ATTACHMENTS_DIR);
		let names: string[];
		try {
			names = readdirSync(directory);
		} catch {
			continue;
		}
		for (const name of names) {
			if (name === ".gitignore") continue;
			const path = join(directory, name);
			try {
				const stat = statSync(path);
				if (!stat.isFile() || stat.mtimeMs >= cutoff) continue;
				unlinkSync(path);
				result.deleted += 1;
				result.freedBytes += stat.size;
			} catch {}
		}
	}
	return result;
}

function attachmentRoots(db: HostDb): string[] {
	return [
		...db
			.select({ path: workspaces.worktreePath })
			.from(workspaces)
			.all()
			.map((row) => row.path),
		...db
			.select({ path: projects.repoPath })
			.from(projects)
			.all()
			.map((row) => row.path),
	];
}

export function sweepWorkspaceAttachments(
	db: HostDb,
	days = readAttachmentRetentionDays(),
): AttachmentSweepResult {
	const result = sweepAttachmentDirectories(attachmentRoots(db), days);
	if (result.deleted > 0)
		console.log(
			`[fork-attachments] deleted ${result.deleted} attachments older than ${days} days (${result.freedBytes} bytes)`,
		);
	return result;
}

export function startAttachmentRetention(db: HostDb): () => void {
	if (process.env.SUPERSET_HOST_RUN_MODE === "sandbox") return () => {};
	const run = () => {
		try {
			sweepWorkspaceAttachments(db);
		} catch (error) {
			console.warn("[fork-attachments] sweep failed", error);
		}
	};
	const first = setTimeout(run, FIRST_SWEEP_DELAY_MS);
	const daily = setInterval(run, DAY_MS);
	first.unref();
	daily.unref();
	return () => {
		clearTimeout(first);
		clearInterval(daily);
	};
}
