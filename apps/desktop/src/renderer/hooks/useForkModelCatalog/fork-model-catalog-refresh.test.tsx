import { expect, test } from "bun:test";
import {
	act,
	flush,
	queryFixture,
	renderHook,
} from "renderer/test-utils/fork-ui";
import { useForkModelCatalog } from "./useForkModelCatalog";

test("opening the catalog reuses the host cache and only Refresh probes the agent again", async () => {
	const calls: Array<{ refresh?: boolean; accountSelection?: string | null }> =
		[];
	const client = (() => ({
		agents: {
			modelCatalog: {
				query: async (input: {
					refresh?: boolean;
					accountSelection?: string | null;
				}) => {
					calls.push(input);
					return { configOptions: [] };
				},
			},
		},
	})) as unknown as typeof import("renderer/lib/host-service-client").getHostServiceClientByUrl;
	const fixture = queryFixture();
	const view = renderHook(
		() =>
			useForkModelCatalog(
				{ hostUrl: "http://host", agent: "claude", accountSelection: "/work" },
				client,
			),
		{ wrapper: fixture.wrapper },
	);
	await flush();
	expect(calls).toHaveLength(1);
	expect(calls[0]?.refresh).toBe(false);
	expect(calls[0]?.accountSelection).toBe("/work");
	await act(async () => {
		await view.result.current.refetch();
	});
	expect(calls).toHaveLength(2);
	expect(calls[1]?.refresh).toBe(true);
	await act(async () => {
		await view.result.current.refetch();
	});
	expect(calls[2]?.refresh).toBe(true);
});
