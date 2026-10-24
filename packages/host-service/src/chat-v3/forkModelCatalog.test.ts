import { afterEach, expect, test } from "bun:test";
import type { SessionConfigOption } from "@superset/chat/protocol";
import { FakeHarness } from "@superset/chat-runtime";
import { hostAgentConfigs } from "../db/schema";
import { createTestDb } from "../trpc/router/pull-requests/shared/test-db";
import type { acpHarnessFactory } from "./acpHarnesses";
import { getForkModelCatalog, readForkModelCatalog } from "./forkModelCatalog";

const databases: ReturnType<typeof createTestDb>[] = [];
afterEach(() => {
	for (const db of databases.splice(0)) db.$client.close();
});
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
	let starts = 0;
	const factory: typeof acpHarnessFactory = () => (input) => {
		starts++;
		return fake(input.accountSelection ?? "default");
	};
	const first = await getForkModelCatalog(
		db,
		{ agent: "cursor", accountSelection: "/account-a" },
		factory,
	);
	expect(
		await getForkModelCatalog(
			db,
			{ agent: "cursor", accountSelection: "/account-a" },
			factory,
		),
	).toBe(first);
	const second = await getForkModelCatalog(
		db,
		{ agent: "cursor", accountSelection: "/account-b" },
		factory,
	);
	expect(second.configOptions[0]?.options[0]?.id).toBe("/account-b");
	expect(starts).toBe(2);
	await getForkModelCatalog(
		db,
		{ agent: "cursor", accountSelection: "/account-a", refresh: true },
		factory,
	);
	expect(starts).toBe(3);
});
