import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionConfigOption } from "@superset/chat/protocol";
import { FakeHarness } from "@superset/chat-runtime";
import { hostAgentConfigs, projects as projectsTable } from "../db/schema";
import { createTestDb } from "../trpc/router/pull-requests/shared/test-db";
import type { acpHarnessFactory } from "./acpHarnesses";
import {
	type ForkModelCatalog,
	type ForkModelCatalogStore,
	fileModelCatalogStore,
	getForkModelCatalog,
	readForkModelCatalog,
} from "./forkModelCatalog";

const databases: ReturnType<typeof createTestDb>[] = [];
const folders: string[] = [];
afterEach(() => {
	for (const db of databases.splice(0)) db.$client.close();
	for (const folder of folders.splice(0))
		rmSync(folder, { recursive: true, force: true });
});
function memoryStore(saved: Record<string, ForkModelCatalog> = {}) {
	const entries = new Map(Object.entries(saved));
	const writes: string[] = [];
	const store: ForkModelCatalogStore = {
		read: (key) => entries.get(key),
		write: (key, catalog) => {
			writes.push(key);
			entries.set(key, catalog);
		},
	};
	return { store, entries, writes };
}
function cursorDb() {
	const db = createTestDb();
	databases.push(db);
	db.insert(hostAgentConfigs)
		.values({
			id: "cursor",
			presetId: "cursor-agent",
			label: "Cursor",
			command: "cursor-agent",
			promptTransport: "argv",
			displayOrder: 0,
		})
		.run();
	return db;
}
async function settle(condition: () => boolean) {
	for (let i = 0; i < 100 && !condition(); i++)
		await new Promise((resolve) => setTimeout(resolve, 1));
}
const options = (id: string): SessionConfigOption[] => [
	{
		id: "model",
		category: "model",
		label: "Model",
		currentValue: id,
		options: [{ id, label: id }],
	},
];
function fake(id: string) {
	return new FakeHarness({
		turns: [],
		start: [
			{ kind: "session", session: { status: "idle" } },
			{ kind: "session", session: { configOptions: options(id) } },
		],
	});
}

test("ACP discovery reads the same options as chat without sending a prompt", async () => {
	const adapter = fake("gemini-4-argon");
	adapter.prompt = () => {
		throw new Error("Discovery must not generate text");
	};
	expect(await readForkModelCatalog(adapter, { cwd: "/tmp" })).toEqual(
		options("gemini-4-argon"),
	);
});

test("model discovery caches requests and isolates agent accounts and refreshes", async () => {
	const db = cursorDb();
	const { store } = memoryStore();
	let starts = 0;
	const factory: typeof acpHarnessFactory = () => (input) => {
		starts++;
		return fake(input.accountSelection ?? "default");
	};
	const first = await getForkModelCatalog(
		db,
		{ agent: "cursor", accountSelection: "/account-a" },
		factory,
		store,
	);
	expect(
		await getForkModelCatalog(
			db,
			{ agent: "cursor", accountSelection: "/account-a" },
			factory,
			store,
		),
	).toBe(first);
	const second = await getForkModelCatalog(
		db,
		{ agent: "cursor", accountSelection: "/account-b" },
		factory,
		store,
	);
	expect(second.configOptions[0]?.options[0]?.id).toBe("/account-b");
	expect(starts).toBe(2);
	await getForkModelCatalog(
		db,
		{ agent: "cursor", accountSelection: "/account-a", refresh: true },
		factory,
		store,
	);
	expect(starts).toBe(3);
});

test("a saved catalog answers at once after a restart and a stale one refreshes behind it", async () => {
	let starts = 0;
	const factory: typeof acpHarnessFactory = () => () => {
		starts++;
		return fake("fresh-model");
	};
	const memory = memoryStore();
	const input = { agent: "cursor", accountSelection: "/account-a" };
	await getForkModelCatalog(cursorDb(), input, factory, memory.store);
	expect(starts).toBe(1);

	const restarted = await getForkModelCatalog(
		cursorDb(),
		input,
		factory,
		memory.store,
	);
	expect(restarted.configOptions[0]?.currentValue).toBe("fresh-model");
	expect(starts).toBe(1);

	const [key] = memory.writes;
	if (!key) throw new Error("catalog not saved");
	memory.entries.set(key, {
		configOptions: options("old-model"),
		fetchedAt: Date.now() - 24 * 60 * 60_000,
	});
	const db = cursorDb();
	const stale = await getForkModelCatalog(db, input, factory, memory.store);
	expect(stale.configOptions[0]?.currentValue).toBe("old-model");
	await settle(() => memory.writes.length === 2);
	expect(starts).toBe(2);
	const refreshed = await getForkModelCatalog(db, input, factory, memory.store);
	expect(refreshed.configOptions[0]?.currentValue).toBe("fresh-model");
});

test("a failed refresh keeps the last catalog", async () => {
	const factory: typeof acpHarnessFactory = () => () => {
		throw new Error("agent unavailable");
	};
	const input = { agent: "cursor", accountSelection: "/account-a" };
	const db = cursorDb();
	const saved = memoryStore();
	const seed: typeof acpHarnessFactory = () => () => fake("kept-model");
	await getForkModelCatalog(db, input, seed, saved.store);
	const [key] = saved.writes;
	if (!key) throw new Error("catalog not saved");
	saved.entries.set(key, {
		configOptions: options("kept-model"),
		fetchedAt: Date.now() - 24 * 60 * 60_000,
	});
	const later = cursorDb();
	expect(
		(await getForkModelCatalog(later, input, factory, saved.store))
			.configOptions[0]?.currentValue,
	).toBe("kept-model");
	await new Promise((resolve) => setTimeout(resolve, 5));
	expect(
		(await getForkModelCatalog(later, input, factory, saved.store))
			.configOptions[0]?.currentValue,
	).toBe("kept-model");
});

test("the file store keeps recent catalogs only", () => {
	const folder = mkdtempSync(join(tmpdir(), "fork-model-catalog-"));
	folders.push(folder);
	const file = join(folder, "fork", "model-catalog.json");
	let now = 1_000_000;
	const store = fileModelCatalogStore(
		() => file,
		1000,
		() => now,
	);
	store.write("a", { configOptions: options("a"), fetchedAt: now });
	store.write("b", { configOptions: options("b"), fetchedAt: now - 2000 });
	expect(JSON.parse(readFileSync(file, "utf8")).entries.a).toBeDefined();
	now += 10;
	const reloaded = fileModelCatalogStore(
		() => file,
		1000,
		() => now,
	);
	expect(reloaded.read("a")?.configOptions[0]?.currentValue).toBe("a");
	expect(reloaded.read("b")).toBeUndefined();
});

test("one catalog serves every workspace of the same agent and account", async () => {
	let starts = 0;
	const factory: typeof acpHarnessFactory = () => () => {
		starts++;
		return fake("shared-model");
	};
	const db = cursorDb();
	const { store } = memoryStore();
	const projects = ["/repo-a", "/repo-b"].map((repoPath, index) => {
		const id = `00000000-0000-4000-8000-00000000000${index + 1}`;
		db.insert(projectsTable).values({ id, repoPath }).run();
		return id;
	});
	for (const projectId of projects)
		await getForkModelCatalog(
			db,
			{ agent: "cursor", accountSelection: "/account-a", projectId },
			factory,
			store,
		);
	expect(starts).toBe(1);
});

test("a refresh that finds a new model saves it for the next start", async () => {
	let model = "old-model";
	let starts = 0;
	const factory: typeof acpHarnessFactory = () => () => {
		starts++;
		return fake(model);
	};
	const { store } = memoryStore();
	const input = { agent: "cursor", accountSelection: "/account-a" };
	await getForkModelCatalog(cursorDb(), input, factory, store);
	model = "new-model";
	await getForkModelCatalog(
		cursorDb(),
		{ ...input, refresh: true },
		factory,
		store,
	);
	const restarted = await getForkModelCatalog(
		cursorDb(),
		input,
		factory,
		store,
	);
	expect(restarted.configOptions[0]?.currentValue).toBe("new-model");
	expect(starts).toBe(2);
});
