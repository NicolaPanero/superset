import { createHash, randomUUID } from "node:crypto";
import {
	lstat,
	mkdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import Database from "better-sqlite3";
import { z } from "zod";

const pending = new Set<string>();
const sessionIdSchema = z.string().uuid();
export type SnapshotDatabase = Pick<
	Database.Database,
	"prepare" | "backup" | "close"
>;

async function rejectLinks(path: string, root: string) {
	for (let p = resolve(path); ; p = dirname(p)) {
		try {
			if ((await lstat(p)).isSymbolicLink())
				throw new Error("cursor_store_symlink");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		if (p === resolve(root)) break;
	}
}

export async function bridgeCursorSession(
	options: {
		cwd: string;
		sessionId: string;
		from: "cli" | "acp";
		cursorRoot?: string;
	},
	openDatabase: (path: string, readonly?: boolean) => SnapshotDatabase = (
		path,
		readonly = true,
	) => new Database(path, { readonly, fileMustExist: true }),
) {
	const id = sessionIdSchema.parse(options.sessionId);
	const root = options.cursorRoot ?? join(homedir(), ".cursor");
	const cliDir = join(
		root,
		"chats",
		createHash("md5").update(options.cwd).digest("hex"),
		id,
	);
	const acpDir = join(root, "acp-sessions", id);
	const sourceDir = options.from === "cli" ? cliDir : acpDir;
	const targetDir = options.from === "cli" ? acpDir : cliDir;
	const key = join(root, id);
	if (pending.has(key)) throw new Error("cursor_surface_switch_in_progress");
	pending.add(key);
	const staging = join(dirname(targetDir), `.superset-${id}-${randomUUID()}`);
	try {
		await rejectLinks(join(sourceDir, "store.db"), root);
		await rejectLinks(join(targetDir, "store.db"), root);
		if (options.from === "acp") {
			const meta = JSON.parse(
				await readFile(join(acpDir, "meta.json"), "utf8"),
			);
			if (meta.schemaVersion !== 1 || meta.cwd !== options.cwd)
				throw new Error("cursor_session_workspace_mismatch");
		}
		let needsCheckpoint = false;
		for (const suffix of ["-wal", "-shm"]) {
			try {
				await lstat(join(targetDir, `store.db${suffix}`));
				needsCheckpoint = true;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
		}
		if (needsCheckpoint) {
			const target = openDatabase(join(targetDir, "store.db"), false);
			try {
				target.prepare("PRAGMA busy_timeout=1000").get();
				const result = target
					.prepare("PRAGMA wal_checkpoint(TRUNCATE)")
					.get() as { busy?: number };
				if (result?.busy !== 0) throw new Error("cursor_target_store_busy");
			} finally {
				target.close();
			}
		}
		const source = openDatabase(join(sourceDir, "store.db"));
		try {
			for (const table of ["blobs", "meta"]) {
				if (
					!source
						.prepare(
							"SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
						)
						.get(table)
				)
					throw new Error("cursor_store_format_unavailable");
			}
			await mkdir(staging, { recursive: true, mode: 0o700 });
			await source.backup(join(staging, "store.db"));
		} finally {
			source.close();
		}
		await mkdir(targetDir, { recursive: true, mode: 0o700 });
		if (options.from === "cli") {
			await writeFile(
				join(staging, "meta.json"),
				JSON.stringify({ schemaVersion: 1, cwd: options.cwd }),
				{ mode: 0o600 },
			);
			await rename(join(staging, "meta.json"), join(targetDir, "meta.json"));
		}
		await rename(join(staging, "store.db"), join(targetDir, "store.db"));
	} finally {
		await rm(staging, { recursive: true, force: true });
		pending.delete(key);
	}
}
