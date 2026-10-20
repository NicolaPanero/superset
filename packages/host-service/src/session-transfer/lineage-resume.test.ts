import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runMigrations } from "@superset/shared/sqlite-migrations";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import { claudeProjectDirName } from "../terminal-agents/harness-sessions/claude";
import type { LineageNode } from "./lineage";
import { lineageResumeLaunch } from "./lineage-resume";

const dirs: string[] = [];
const databases: Database[] = [];
afterEach(() => {
	for (const sqlite of databases.splice(0)) sqlite.close();
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function fixture() {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "lineage-resume-")));
	dirs.push(dir);
	const sqlite = new Database(":memory:");
	databases.push(sqlite);
	const db = drizzle(sqlite, { schema }) as unknown as HostDb;
	runMigrations(db, resolve(import.meta.dir, "../../drizzle"));
	const cwd = join(dir, "workspace"),
		profile = join(dir, "original-account"),
		otherProfile = join(dir, "new-account");
	mkdirSync(cwd);
	mkdirSync(otherProfile);
	const storeRoot = join(profile, "projects"),
		project = join(storeRoot, claudeProjectDirName(cwd));
	mkdirSync(project, { recursive: true });
	const sessionId = "00000000-0000-4000-8000-000000000001",
		reference = join(project, `${sessionId}.jsonl`);
	writeFileSync(
		reference,
		`${JSON.stringify({ type: "user", message: { role: "user", content: "fixture" } })}\n`,
	);
	db.insert(schema.hostAgentConfigs)
		.values({
			id: "config",
			presetId: "claude",
			label: "Claude",
			command: "claude",
			displayOrder: 0,
			promptTransport: "argv",
			resumeArgsJson: '["--resume"]',
			envJson: JSON.stringify({
				CLAUDE_CONFIG_DIR: otherProfile,
				ANTHROPIC_API_KEY: "test-only-placeholder",
			}),
		})
		.run();
	const node: LineageNode = {
		id: "node",
		organizationId: "org",
		workspaceId: "workspace",
		agent: "claude",
		sessionId,
		storeRoot,
		reference,
		cwd,
		configId: "config",
		label: "Claude",
		profileOverride: profile,
		lastTerminalId: null,
		createdAt: 1,
	};
	return { db, node, cwd, profile, reference, dir };
}

test("reopening pins the saved profile even when the agent config selects a different account", async () => {
	const { db, node, cwd, profile } = fixture();
	const launch = await lineageResumeLaunch(db, node, cwd);
	expect(launch.resumeSessionId).toBe(node.sessionId);
	expect(launch.launchSnapshot?.env.CLAUDE_CONFIG_DIR).toBe(profile);
	expect(launch.launchSnapshot?.env.SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR).toBe(
		"",
	);
	expect(launch.launchSnapshot?.env.SUPERSET_PINNED_ACCOUNT_ENV).toBe(
		"CLAUDE_CONFIG_DIR",
	);
	expect(launch.launchSnapshot?.env.ANTHROPIC_API_KEY).toBe(
		"test-only-placeholder",
	);
});

test("refuses a different workspace directory", async () => {
	const { db, node, dir } = fixture();
	await expect(lineageResumeLaunch(db, node, dir)).rejects.toThrow(
		"lineage_workspace_changed",
	);
});

test("refuses a deleted native session before launching a process", async () => {
	const { db, node, cwd, reference } = fixture();
	rmSync(reference);
	await expect(lineageResumeLaunch(db, node, cwd)).rejects.toThrow(
		"lineage_session_unavailable",
	);
});

test("refuses deleted or incompatible agent configurations", async () => {
	const { db, node, cwd } = fixture();
	db.update(schema.hostAgentConfigs)
		.set({ presetId: "codex" })
		.where(eq(schema.hostAgentConfigs.id, "config"))
		.run();
	await expect(lineageResumeLaunch(db, node, cwd)).rejects.toThrow(
		"lineage_config_unavailable",
	);
	db.delete(schema.hostAgentConfigs)
		.where(eq(schema.hostAgentConfigs.id, "config"))
		.run();
	await expect(lineageResumeLaunch(db, node, cwd)).rejects.toThrow(
		"lineage_config_unavailable",
	);
});
