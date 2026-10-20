import { expect, test } from "bun:test";
import { importWorkspace } from "./importWorkspace";

test("reuses a local workspace without launching an agent", async () => {
	let created = false;
	const id = await importWorkspace(
		{
			workspace: {
				list: {
					query: async () => [
						{ id: "old", projectId: "project", type: "local" },
					],
				},
			},
			workspaces: {
				createLocal: {
					mutate: async () => {
						created = true;
						return { workspace: { id: "new" } };
					},
				},
			},
		},
		"project",
	);
	expect(id).toBe("old");
	expect(created).toBe(false);
});
test("opens a project's existing checkout without prompt, agent or setup terminal", async () => {
	let input: unknown;
	const id = await importWorkspace(
		{
			workspace: {
				list: {
					query: async () => [
						{ id: "other", projectId: "other", type: "local" },
					],
				},
			},
			workspaces: {
				createLocal: {
					mutate: async (args) => {
						input = args;
						return { workspace: { id: "new" } };
					},
				},
			},
		},
		"project",
	);
	expect(id).toBe("new");
	expect(input).toEqual({ projectId: "project", agents: [], runSetup: false });
});
