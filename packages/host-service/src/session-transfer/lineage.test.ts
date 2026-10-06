import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runMigrations } from "@superset/shared/sqlite-migrations";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { HostDb } from "../db";
import * as forkSchema from "../db/fork-schema";
import { ensureForkTables } from "../db/fork-tables";
import * as schema from "../db/schema";
import { type LineageNodeInput, LocalLineageStore } from "./lineage";

const dirs: string[] = [];
const connections: Database[] = [];
afterEach(() => {
	for (const db of connections.splice(0)) db.close();
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function open(path = ":memory:") {
	const sqlite = new Database(path);
	connections.push(sqlite);
	const db = drizzle(sqlite, { schema });
	runMigrations(db, resolve(import.meta.dir, "../../drizzle"));
	ensureForkTables(sqlite);
	sqlite.exec("PRAGMA foreign_keys=ON");
	return db as unknown as HostDb;
}

function workspace(db: HostDb, id = "workspace") {
	db.insert(schema.workspaces)
		.values({ id, worktreePath: "/poc", branch: "main", type: "session" })
		.onConflictDoNothing()
		.run();
}

function node(
	agent: LineageNodeInput["agent"],
	sessionId: string,
): LineageNodeInput {
	return {
		agent,
		sessionId,
		cwd: "/poc",
		storeRoot: `/profiles/${agent}`,
		reference: `/profiles/${agent}/${sessionId}`,
		configId: `${agent}-config`,
		label: agent,
		profileOverride: null,
		lastTerminalId: null,
	};
}

describe("local native lineage", () => {
	test("records branches and chains without duplicating their shared nodes", () => {
		const db = open();
		workspace(db);
		const store = new LocalLineageStore(db, "org");
		const a = node("claude", "a"),
			b = node("codex", "b"),
			c = node("grok", "c"),
			d = node("opencode", "d");
		store.record({
			id: "ab",
			workspaceId: "workspace",
			source: a,
			target: b,
			warnings: [],
			createdAt: 1,
		});
		store.record({
			id: "ac",
			workspaceId: "workspace",
			source: a,
			target: c,
			warnings: [],
			createdAt: 2,
		});
		store.record({
			id: "bd",
			workspaceId: "workspace",
			source: b,
			target: d,
			warnings: [],
			createdAt: 3,
		});
		const rows = store.list("workspace", 100).items;
		expect(rows).toHaveLength(3);
		expect(rows[1]?.source.id).toBe(rows[2]?.source.id);
		expect(rows[0]?.source.id).toBe(rows[2]?.target.id);
		expect(db.select().from(forkSchema.sessionLineageNodes).all()).toHaveLength(
			4,
		);
	});

	test("retains the original configuration and account affinity when a node becomes a parent", () => {
		const db = open();
		workspace(db);
		const store = new LocalLineageStore(db, "org");
		const original = {
			...node("codex", "b"),
			configId: "personal-config",
			profileOverride: "/accounts/personal",
			lastTerminalId: "terminal-b",
		};
		store.record({
			id: "ab",
			workspaceId: "workspace",
			source: node("claude", "a"),
			target: original,
			warnings: [],
		});
		store.record({
			id: "bc",
			workspaceId: "workspace",
			source: {
				...original,
				configId: "new-default",
				profileOverride: "/accounts/other",
			},
			target: node("grok", "c"),
			warnings: [],
		});
		const found = store.findSession("workspace", "codex", "b", "terminal-b");
		expect(found?.configId).toBe("personal-config");
		expect(found?.profileOverride).toBe("/accounts/personal");
	});

	test("isolates organizations, workspaces, and identical native IDs in different profiles", () => {
		const db = open();
		workspace(db);
		workspace(db, "other-workspace");
		const store = new LocalLineageStore(db, "org");
		const a = node("claude", "a"),
			b = node("codex", "b");
		const edge = store.record({
			id: "ab",
			workspaceId: "workspace",
			source: a,
			target: b,
			warnings: [],
		});
		store.record({
			id: "a-other-b",
			workspaceId: "workspace",
			source: a,
			target: {
				...b,
				storeRoot: "/other-profile",
				profileOverride: "/other-profile",
				lastTerminalId: "other-terminal",
			},
			warnings: [],
		});
		expect(
			new LocalLineageStore(db, "other-org").list("workspace", 100).items,
		).toHaveLength(0);
		expect(store.node("other-workspace", edge.targetNodeId)).toBeUndefined();
		expect(store.edge("other-workspace", "ab")).toBeUndefined();
		expect(
			store.findSession("workspace", "codex", "b", "unknown-terminal"),
		).toBeUndefined();
		expect(
			store.findSession("workspace", "codex", "b", "other-terminal")?.storeRoot,
		).toBe("/other-profile");
	});

	test("makes repeated recording idempotent and rolls back conflicting records", () => {
		const db = open();
		workspace(db);
		const store = new LocalLineageStore(db, "org");
		const input = {
			id: "ab",
			workspaceId: "workspace",
			source: node("claude", "a"),
			target: node("codex", "b"),
			warnings: ["metadata"],
			createdAt: 1,
		};
		expect(store.record(input)).toEqual(store.record(input));
		expect(() =>
			store.record({ ...input, target: node("codex", "other") }),
		).toThrow("lineage_transfer_conflict");
		expect(db.select().from(forkSchema.sessionLineageNodes).all()).toHaveLength(
			2,
		);
		expect(store.list("workspace", 100).items).toHaveLength(1);
	});

	test("uses stable cursors when timestamps match", () => {
		const db = open();
		workspace(db);
		const store = new LocalLineageStore(db, "org");
		for (const id of ["a", "c", "b"])
			store.record({
				id,
				workspaceId: "workspace",
				source: node("claude", "source"),
				target: node("codex", id),
				warnings: [],
				createdAt: 10,
			});
		const first = store.list("workspace", 2);
		expect(first.items.map((edge) => edge.id)).toEqual(["c", "b"]);
		if (!first.nextCursor) throw new Error("Expected another page");
		const second = store.list("workspace", 2, first.nextCursor);
		expect(second.items.map((edge) => edge.id)).toEqual(["a"]);
		expect(second.nextCursor).toBeNull();
	});

	test("survives a database reopen and terminal deletion; workspace deletion cleans its graph", () => {
		const dir = mkdtempSync(join(tmpdir(), "superset-lineage-"));
		dirs.push(dir);
		const path = join(dir, "host.db");
		const first = open(path);
		workspace(first);
		const store = new LocalLineageStore(first, "org");
		first
			.insert(schema.terminalSessions)
			.values({ id: "terminal", originWorkspaceId: "workspace" })
			.run();
		const edge = store.record({
			id: "ab",
			workspaceId: "workspace",
			source: node("claude", "a"),
			target: node("codex", "b"),
			warnings: ["preserved"],
		});
		store.setTerminal("workspace", edge.targetNodeId, "terminal");
		first
			.delete(schema.terminalSessions)
			.where(eq(schema.terminalSessions.id, "terminal"))
			.run();
		connections.pop()?.close();
		const reopened = open(path);
		const rows = new LocalLineageStore(reopened, "org").list(
			"workspace",
			10,
		).items;
		expect(rows).toHaveLength(1);
		expect(rows[0]?.target.lastTerminalId).toBe("terminal");
		expect(rows[0]?.warnings).toEqual(["preserved"]);
		reopened
			.delete(schema.workspaces)
			.where(eq(schema.workspaces.id, "workspace"))
			.run();
		expect(
			reopened.select().from(forkSchema.sessionLineageNodes).all(),
		).toHaveLength(0);
		expect(
			reopened.select().from(forkSchema.sessionLineageEdges).all(),
		).toHaveLength(0);
	});
});
