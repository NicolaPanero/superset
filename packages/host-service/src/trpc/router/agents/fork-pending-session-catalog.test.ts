import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { FakeHarness } from "@superset/chat-runtime";
import type { acpHarnessFactory } from "../../../chat-v3/acpHarnesses";
import { getForkModelCatalog } from "../../../chat-v3/forkModelCatalog";
import { hostAgentConfigs } from "../../../db/schema";
import { createTestDb } from "../pull-requests/shared/test-db";
import { validateAgentLaunchOptions } from "./agents";
import { prepareForkCatalogLaunch } from "./fork-catalog-launch";

function fixture() {
	const db = createTestDb();
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
	let probes = 0;
	const factory: typeof acpHarnessFactory = () => () => {
		probes++;
		const adapter = new FakeHarness({
			turns: [],
			start: [
				{
					kind: "session",
					session: {
						status: "idle",
						configOptions: [
							{
								id: "model",
								label: "Model",
								category: "model",
								currentValue: "argon",
								options: [{ id: "argon", label: "Argon" }],
							},
						],
					},
				},
			],
		});
		adapter.prompt = () => {
			throw new Error("Model validation must not send a prompt");
		};
		return adapter;
	};
	const load: typeof getForkModelCatalog = (db, input) =>
		getForkModelCatalog(db, input, factory);
	const input = {
		agent: "cursor",
		model: "argon",
		modelCatalog: "agent" as const,
		workspaceId: randomUUID(),
	};
	return { db, load, input, probes: () => probes };
}

test("session preflight validates a discovered model before the optimistic workspace exists", async () => {
	const f = fixture();
	try {
		const launch = await prepareForkCatalogLaunch(
			f.db,
			f.input,
			{ pendingWorkspace: true },
			f.load,
		);
		expect(launch.workspaceId).toBe(f.input.workspaceId);
		expect(launch.model).toBe("argon");
		expect(() => validateAgentLaunchOptions(f.db, launch)).not.toThrow();
		expect(f.probes()).toBe(1);
	} finally {
		f.db.$client.close();
	}
});

test("an ordinary launch still rejects a missing workspace before probing the agent", async () => {
	const f = fixture();
	try {
		await expect(
			prepareForkCatalogLaunch(f.db, f.input, {}, f.load),
		).rejects.toThrow("workspace_unavailable");
		expect(f.probes()).toBe(0);
	} finally {
		f.db.$client.close();
	}
});
