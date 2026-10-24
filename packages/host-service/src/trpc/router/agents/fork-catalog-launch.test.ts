import { expect, test } from "bun:test";
import type { getForkModelCatalog } from "../../../chat-v3/forkModelCatalog";
import { hostAgentConfigs } from "../../../db/schema";
import { createTestDb } from "../pull-requests/shared/test-db";
import {
	buildTerminalAgentLaunch,
	chatLaunchTarget,
	validateAgentLaunchOptions,
} from "./agents";
import { prepareForkCatalogLaunch } from "./fork-catalog-launch";

test("discovered models and efforts survive workspace validation and launch instead of falling back to defaults", async () => {
	const db = createTestDb();
	try {
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
		const load: typeof getForkModelCatalog = async () => ({
			fetchedAt: 1,
			configOptions: [
				{
					id: "model",
					label: "Model",
					category: "model",
					currentValue: "gemini-next",
					options: [{ id: "gemini-next", label: "Gemini Next" }],
				},
				{
					id: "native-effort",
					label: "Effort",
					category: "thought_level",
					options: [{ id: "high", label: "High" }],
				},
			],
		});
		const input = await prepareForkCatalogLaunch(
			db,
			{
				agent: "cursor",
				model: "gemini-next",
				effort: "high",
				modelCatalog: "agent" as const,
				surface: "chat" as const,
				prompt: "hello",
				workspaceId: "workspace",
			},
			{},
			load,
		);
		expect(() => validateAgentLaunchOptions(db, input)).not.toThrow();
		expect(buildTerminalAgentLaunch(db, input).fullCommand).toContain(
			"gemini-next[effort=high]",
		);
		expect(chatLaunchTarget(db, input)?.harness).toBe("cursor-acp");
		await expect(
			prepareForkCatalogLaunch(
				db,
				{ ...input, model: "removed-model" },
				{},
				load,
			),
		).rejects.toThrow("no longer available");
	} finally {
		db.$client.close();
	}
});

test("workspace preflight discovers models in the project before the new workspace exists", async () => {
	const db = createTestDb();
	try {
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
		let received: Parameters<typeof getForkModelCatalog>[1] | undefined;
		const load: typeof getForkModelCatalog = async (_db, input) => {
			received = input;
			return {
				fetchedAt: 1,
				configOptions: [
					{
						id: "model",
						label: "Model",
						category: "model",
						options: [{ id: "argon", label: "Argon" }],
					},
				],
			};
		};
		await prepareForkCatalogLaunch(
			db,
			{
				agent: "cursor",
				model: "argon",
				modelCatalog: "agent",
				workspaceId: "new-workspace-not-created",
			},
			{ projectId: "project" },
			load,
		);
		expect(received?.projectId).toBe("project");
		expect(received?.workspaceId).toBeUndefined();
	} finally {
		db.$client.close();
	}
});
