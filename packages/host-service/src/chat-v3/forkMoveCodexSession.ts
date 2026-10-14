import { randomUUID } from "node:crypto";
import {
	chmod,
	copyFile,
	lstat,
	mkdir,
	open,
	readdir,
	realpath,
	rename,
	rm,
	utimes,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

async function rolloutFiles(root: string, sessionId: string) {
	const stack = [root],
		found: Array<{ path: string; mtime: number }> = [];
	let visited = 0;
	const pattern = new RegExp(`^rollout-.*-${sessionId}(?:_[\\w-]+)?\\.jsonl$`);
	while (stack.length) {
		if (++visited > 2000) throw new Error("session_search_incomplete");
		const dir = stack.pop() as string;
		const entries = await readdir(dir, { withFileTypes: true }).catch(
			(error) => {
				if (error.code === "ENOENT") return [];
				throw error;
			},
		);
		for (const entry of entries) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) stack.push(path);
			else if (entry.isFile() && pattern.test(entry.name)) {
				const info = await lstat(path);
				if (info.isFile()) found.push({ path, mtime: info.mtimeMs });
			}
		}
	}
	return found.sort((a, b) => b.mtime - a.mtime);
}
async function checkRoot(directory: string) {
	const home = await realpath(directory),
		root = join(home, "sessions");
	const actual = await realpath(root).catch((error) => {
		if (error.code === "ENOENT") return root;
		throw error;
	});
	if (actual !== root) throw new Error("session_store_not_isolated");
	return root;
}
async function verifySession(path: string, sessionId: string) {
	const handle = await open(path, "r");
	try {
		const buffer = Buffer.alloc(64 * 1024);
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
		const first = buffer.subarray(0, bytesRead).toString("utf8").split("\n")[0];
		const meta = JSON.parse(first ?? "");
		if (meta.type !== "session_meta" || meta.payload?.id !== sessionId)
			throw new Error("session_identity_mismatch");
	} finally {
		await handle.close();
	}
}
export async function moveCodexSession({
	sessionId,
	sourceDir,
	targetDir,
}: {
	sessionId: string;
	sourceDir: string;
	targetDir: string;
}): Promise<{ moved: boolean }> {
	if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(sessionId))
		throw new Error("invalid_session_id");
	const sourceRoot = await checkRoot(sourceDir),
		targetRoot = await checkRoot(targetDir);
	const source = (await rolloutFiles(sourceRoot, sessionId))[0];
	if (!source) throw new Error("session_not_found");
	await verifySession(source.path, sessionId);
	if (sourceRoot === targetRoot) return { moved: false };
	const destination = join(targetRoot, relative(sourceRoot, source.path));
	const existing = await rolloutFiles(targetRoot, sessionId);
	if (
		existing.some(
			(file) => file.path !== destination || file.mtime > source.mtime,
		)
	)
		throw new Error("session_history_conflict");
	let parent = targetRoot;
	for (const part of relative(targetRoot, dirname(destination)).split(
		/[\\/]/,
	)) {
		parent = join(parent, part);
		const info = await lstat(parent).catch((error) => {
			if (error.code === "ENOENT") return null;
			throw error;
		});
		if (info && !info.isDirectory())
			throw new Error("session_store_not_isolated");
	}
	await mkdir(dirname(destination), { recursive: true });
	if ((await realpath(dirname(destination))) !== resolve(dirname(destination)))
		throw new Error("session_store_not_isolated");
	const temporary = `${destination}.${randomUUID()}.tmp`;
	try {
		await copyFile(source.path, temporary);
		await chmod(temporary, 0o600);
		await utimes(temporary, new Date(source.mtime), new Date(source.mtime));
		await rename(temporary, destination);
	} finally {
		await rm(temporary, { force: true });
	}
	return { moved: true };
}
