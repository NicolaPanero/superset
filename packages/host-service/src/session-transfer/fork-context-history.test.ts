import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { runMigrations } from "@superset/shared/sqlite-migrations";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { HostDb } from "../db";
import { ensureForkTables } from "../db/fork-tables";
import * as schema from "../db/schema";
import {
	type HistoryRequest,
	readHandoffHistory,
	readHandoffSourcePage,
} from "./fork-context-history";
import { LocalLineageStore } from "./lineage";
import type { EarlierHistory } from "./txcript";

const connections: Database[] = [];
afterEach(() => {
	for (const db of connections.splice(0)) db.close();
});

function open() {
	const sqlite = new Database(":memory:");
	connections.push(sqlite);
	const db = drizzle(sqlite, { schema });
	runMigrations(db, resolve(import.meta.dir, "../../drizzle"));
	ensureForkTables(sqlite);
	sqlite.exec("PRAGMA foreign_keys=ON");
	for (const id of ["workspace-a", "workspace-b"])
		db.insert(schema.workspaces)
			.values({ id, worktreePath: "/poc", branch: "main", type: "session" })
			.run();
	return db as unknown as HostDb;
}

function page(
	indices: number[],
	nextBefore: number | null,
	extra: Partial<EarlierHistory> = {},
): EarlierHistory {
	return {
		protocolVersion: 1,
		engineVersion: "0.14.4-fork.24",
		truncated: nextBefore !== null,
		nextBefore,
		messages: indices.map((index) => ({
			index,
			role: index % 2 ? "assistant" : "user",
			timestampMs: index,
			blocks: [{ type: "text", text: `message ${index}` }],
		})),
		...extra,
	};
}

describe("readHandoffHistory", () => {
	test("pages back to the session start, oldest message first", async () => {
		const requests: Array<number | undefined> = [];
		const history = await readHandoffHistory(async (before) => {
			requests.push(before);
			return before === undefined ? page([4, 5], 4) : page([0, 1, 2, 3], null);
		});
		expect(requests).toEqual([undefined, 4]);
		expect(history.omittedUnknown).toBe(false);
		expect(history.messages.map((message) => message.index)).toEqual([
			0, 1, 2, 3, 4, 5,
		]);
	});

	test("past the page limit, reads the session start and reports the gap", async () => {
		const requests: Array<number | undefined> = [];
		const history = await readHandoffHistory(async (before) => {
			requests.push(before);
			if (before === undefined) return page([900, 901], 900);
			if (before === 50) return page([0, 1], 2);
			return page([before - 1], before - 1);
		}, 2);
		expect(requests).toEqual([undefined, 900, 50]);
		expect(history.omittedUnknown).toBe(true);
		expect(history.messages.map((message) => message.index)).toEqual([
			0, 1, 899, 900, 901,
		]);
	});

	test("rejects a cursor that does not move back", async () => {
		await expect(readHandoffHistory(async () => page([5], 5))).rejects.toThrow(
			"invalid_history_cursor",
		);
	});

	test("drops image data while reading", async () => {
		const history = await readHandoffHistory(async () => ({
			...page([], null),
			messages: [
				{
					index: 0,
					role: "user",
					timestampMs: 0,
					blocks: [{ type: "image", mediaType: "image/png", data: "QUJD" }],
				},
			],
		}));
		expect(JSON.stringify(history.messages)).not.toContain("QUJD");
	});
});

describe("readHandoffSourcePage", () => {
	const source = {
		agent: "claude" as const,
		sessionId: "11111111-1111-4111-8111-111111111111",
		storeRoot: "/profiles/claude/projects",
		reference: "/profiles/claude/projects/p/1111.jsonl",
		cwd: "/poc",
		configId: "claude",
		label: "Claude",
		profileOverride: null,
		lastTerminalId: null,
	};

	test("reads only a session recorded in the same workspace and organization", async () => {
		const db = open();
		const node = new LocalLineageStore(db, "org-a").ensureNode(
			"workspace-a",
			source,
		);
		const requests: HistoryRequest[] = [];
		const history = async (request: HistoryRequest) => {
			requests.push(request);
			return page([0, 1], null);
		};
		for (const [organization, workspaceId, sourceNodeId] of [
			["org-b", "workspace-a", node.id],
			["org-a", "workspace-b", node.id],
			["org-a", "workspace-a", "22222222-2222-4222-8222-222222222222"],
		] as const)
			await expect(
				readHandoffSourcePage({
					lineage: new LocalLineageStore(db, organization),
					history,
					workspaceId,
					sourceNodeId,
				}),
			).rejects.toThrow("handoff_source_unavailable");
		expect(requests).toHaveLength(0);

		const result = await readHandoffSourcePage({
			lineage: new LocalLineageStore(db, "org-a"),
			history,
			workspaceId: "workspace-a",
			sourceNodeId: node.id,
			before: 9,
		});
		expect(requests).toEqual([
			{
				sourceAgent: "claude",
				sourceSessionId: source.sessionId,
				sourceRoot: source.storeRoot,
				sourceReference: source.reference,
				all: true,
				before: 9,
			},
		]);
		expect(result).toMatchObject({ messages: 2, nextBefore: null });
		expect(result.text).toContain("#1 Claude:\nmessage 1");
	});

	test("records one node per session however often it is handed off", () => {
		const db = open();
		const store = new LocalLineageStore(db, "org-a");
		const first = store.ensureNode("workspace-a", source);
		const second = store.ensureNode("workspace-a", {
			...source,
			lastTerminalId: "33333333-3333-4333-8333-333333333333",
		});
		expect(second.id).toBe(first.id);
		expect(store.list("workspace-a", 10).items).toHaveLength(0);
	});
});
