import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runMigrations } from "@superset/shared/sqlite-migrations";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { HostDb } from "../../../db";
import { ensureForkTables } from "../../../db/fork-tables";
import * as schema from "../../../db/schema";
import { listAccountAliases, setAccountAlias } from "./account-aliases";

const connections: Database[] = [];
const dirs: string[] = [];
afterEach(() => {
	for (const connection of connections.splice(0)) connection.close();
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});
function open(path = ":memory:") {
	const sqlite = new Database(path);
	connections.push(sqlite);
	const db = drizzle(sqlite, { schema });
	runMigrations(db, resolve(import.meta.dir, "../../../../drizzle"));
	ensureForkTables(sqlite);
	return db as unknown as HostDb;
}

test("aliases preserve provider/profile identity and clear without leaving tombstones", () => {
	const db = open();
	setAccountAlias(db, "claude", null, "Personal");
	setAccountAlias(db, "codex", null, "Work");
	setAccountAlias(db, "claude", "/profiles/work", "Team");
	setAccountAlias(db, "claude", null, "Renamed");
	const aliases = listAccountAliases(db);
	expect(aliases).toHaveLength(3);
	expect(
		aliases.find((a) => a.agent === "claude" && a.selection === null)?.label,
	).toBe("Renamed");
	expect(aliases.find((a) => a.agent === "codex")?.label).toBe("Work");
	setAccountAlias(db, "claude", "/profiles/work", null);
	expect(listAccountAliases(db)).toHaveLength(2);
});

test("host-local aliases survive reopening the real migrated SQLite database", () => {
	const dir = mkdtempSync(join(tmpdir(), "account-aliases-"));
	dirs.push(dir);
	const path = join(dir, "host.db");
	setAccountAlias(open(path), "codex", null, "Daily");
	for (const connection of connections.splice(0)) connection.close();
	expect(listAccountAliases(open(path))).toEqual([
		{ agent: "codex", selection: null, label: "Daily" },
	]);
	expect(listAccountAliases(open())).toHaveLength(0);
});

test("bounded aliases permit renames at the cap and make deletion reclaim capacity", () => {
	const db = open();
	for (let i = 0; i < 128; i++)
		setAccountAlias(db, "claude", `/profiles/${i}`, `Profile ${i}`);
	expect(() => setAccountAlias(db, "codex", null, "Overflow")).toThrow(
		"account_alias_limit",
	);
	setAccountAlias(db, "claude", "/profiles/0", "Changed");
	expect(listAccountAliases(db)).toHaveLength(128);
	setAccountAlias(db, "claude", "/profiles/1", null);
	setAccountAlias(db, "codex", null, "Available");
	expect(listAccountAliases(db)).toHaveLength(128);
});

test("invalid or invisible names and oversized selection paths are rejected", () => {
	const db = open();
	for (const name of ["x".repeat(65), "hidden\u202Ename", "line\nbreak"])
		expect(() => setAccountAlias(db, "claude", null, name)).toThrow(
			"account_alias_invalid",
		);
	expect(() =>
		setAccountAlias(db, "claude", "x".repeat(4097), "Valid"),
	).toThrow("account_alias_invalid");
	expect(listAccountAliases(db)).toHaveLength(0);
});
