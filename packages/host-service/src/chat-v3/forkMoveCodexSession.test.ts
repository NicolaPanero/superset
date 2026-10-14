import { afterEach, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	codexSessionFiles,
	codexSessionStore,
} from "../terminal-agents/harness-sessions/codex";
import { moveCodexSession } from "./forkMoveCodexSession";

const id = "11111111-2222-4333-8444-555555555555";
const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "codex-rotation-"));
	roots.push(root);
	const sourceDir = join(root, "source"),
		targetDir = join(root, "target");
	mkdirSync(sourceDir);
	mkdirSync(targetDir);
	return { root, sourceDir, targetDir, sessionId: id };
}
function rollout(
	home: string,
	body = "current",
	suffix = "",
	metadataId = id,
	time = 100,
) {
	const folder = join(home, "sessions", "2026", "10", "14");
	mkdirSync(folder, { recursive: true });
	const path = join(folder, `rollout-2026-10-14T22-00-00-${id}${suffix}.jsonl`);
	writeFileSync(
		path,
		JSON.stringify({ type: "session_meta", payload: { id: metadataId } }) +
			"\n" +
			body,
	);
	utimesSync(path, time, time);
	return path;
}
test("Codex account rotation copies the newest rollout intact and keeps target credentials and config", async () => {
	const f = fixture();
	rollout(f.sourceDir, "older", "", id, 50);
	const source = rollout(
		f.sourceDir,
		"tools + compacted history",
		"_reverted",
		id,
		100,
	);
	writeFileSync(join(f.sourceDir, "auth.json"), "source-secret");
	writeFileSync(join(f.targetDir, "auth.json"), "target-secret");
	writeFileSync(join(f.targetDir, "config.toml"), "target-config");
	expect(await moveCodexSession(f)).toEqual({ moved: true });
	const destination = source.replace(f.sourceDir, f.targetDir);
	expect(readFileSync(destination, "utf8")).toBe(readFileSync(source, "utf8"));
	expect(readFileSync(join(f.targetDir, "auth.json"), "utf8")).toBe(
		"target-secret",
	);
	expect(readFileSync(join(f.targetDir, "config.toml"), "utf8")).toBe(
		"target-config",
	);
	expect(statSync(destination).mode & 0o777).toBe(0o600);
	expect(
		codexSessionFiles.locate({
			sessionId: id,
			worktreePath: f.root,
			env: { CODEX_HOME: f.targetDir },
		}),
	).toBe(destination);
	expect(
		codexSessionStore.hasSession({
			sessionId: id,
			worktreePath: f.root,
			env: { CODEX_HOME: f.targetDir },
		}),
	).toBe(true);
});
test("Codex rotation updates an older copy of the same rollout and can reuse the same profile", async () => {
	const f = fixture();
	const source = rollout(f.sourceDir, "new", "", id, 100);
	const target = rollout(f.targetDir, "old", "", id, 50);
	await moveCodexSession(f);
	expect(readFileSync(target, "utf8")).toBe(readFileSync(source, "utf8"));
	expect(await moveCodexSession({ ...f, targetDir: f.sourceDir })).toEqual({
		moved: false,
	});
});
test("Codex rotation refuses conflicting or newer target history without overwriting it", async () => {
	const f = fixture();
	rollout(f.sourceDir);
	const target = rollout(f.targetDir, "newer", "", id, 200);
	await expect(moveCodexSession(f)).rejects.toThrow("session_history_conflict");
	expect(readFileSync(target, "utf8")).toContain("newer");
	rmSync(target);
	rollout(f.targetDir, "different rollback", "_other", id, 50);
	await expect(moveCodexSession(f)).rejects.toThrow("session_history_conflict");
});
test("Codex rotation rejects missing, mismatched and path-like session IDs", async () => {
	const f = fixture();
	await expect(moveCodexSession(f)).rejects.toThrow("session_not_found");
	rollout(f.sourceDir, "wrong", "", "00000000-0000-4000-8000-000000000000");
	await expect(moveCodexSession(f)).rejects.toThrow(
		"session_identity_mismatch",
	);
	await expect(
		moveCodexSession({ ...f, sessionId: "../../auth" }),
	).rejects.toThrow("invalid_session_id");
});
test("Codex rotation never writes into a target session store linked to another profile", async () => {
	const f = fixture();
	rollout(f.sourceDir);
	const foreign = join(f.root, "foreign");
	mkdirSync(foreign);
	symlinkSync(foreign, join(f.targetDir, "sessions"));
	await expect(moveCodexSession(f)).rejects.toThrow(
		"session_store_not_isolated",
	);
});
