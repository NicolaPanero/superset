import { expect, test } from "bun:test";
import type { HostAgentConfig } from "@superset/host-service/settings";
import type { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	act,
	flush,
	queryFixture,
	renderHook,
} from "renderer/test-utils/fork-ui";
import { useForkAgentSetup } from "./useForkAgentSetup";

const config: HostAgentConfig = {
	id: "config",
	presetId: "grok",
	label: "Grok",
	command: "grok",
	args: [],
	promptTransport: "argv",
	promptArgs: [],
	resumeArgs: [],
	forkArgs: [],
	env: { XAI_API_KEY: "secret-fixture" },
	order: 0,
	iconId: null,
};
test("requests and setup mutations stay on the selected host, with no key in query cache identifiers", async () => {
	const f = queryFixture();
	const calls: { host: string; input: unknown }[] = [];
	const client = (host: string) => ({
		settings: {
			forkAgentSetup: {
				inspect: {
					query: async () => ({
						command: "/provider/grok",
						revision: "a".repeat(64),
					}),
				},
				configure: {
					mutate: async (input: unknown) => {
						calls.push({ host, input });
					},
				},
			},
			agentConfigs: { list: { query: async () => [config] } },
		},
	});
	const view = renderHook(
		({ host }) =>
			useForkAgentSetup(
				host,
				config,
				client as unknown as typeof getHostServiceClientByUrl,
			),
		{ initialProps: { host: "http://first" }, wrapper: f.wrapper },
	);
	await flush();
	expect(
		JSON.stringify(
			f.client
				.getQueryCache()
				.getAll()
				.map((row) => row.queryKey),
		),
	).not.toContain("secret-fixture");
	view.rerender({ host: "http://second" });
	await flush();
	await act(async () => {
		await view.result.current.apply.mutateAsync(undefined);
	});
	expect(calls).toHaveLength(1);
	expect(calls[0].host).toBe("http://second");
	expect(calls[0].input).toMatchObject({
		configId: "config",
		expectedRevision: "a".repeat(64),
	});
});
test("an old host's missing procedure is handled locally and cannot apply setup", async () => {
	const f = queryFixture();
	const client = () => ({
		settings: {
			forkAgentSetup: {
				inspect: {
					query: async () => {
						throw new Error("NOT_FOUND");
					},
				},
			},
		},
	});
	const view = renderHook(
		() =>
			useForkAgentSetup(
				"http://old-host",
				config,
				client as unknown as typeof getHostServiceClientByUrl,
			),
		{ wrapper: f.wrapper },
	);
	await flush();
	expect(view.result.current.isError).toBe(true);
	await act(async () => {
		await expect(
			view.result.current.apply.mutateAsync(undefined),
		).rejects.toThrow("agent_setup_unavailable");
	});
});

test("Cursor keys use the dedicated field and older hosts cannot silently discard them", async () => {
	for (const supported of [true, false]) {
		const f = queryFixture();
		const calls: unknown[] = [];
		const cursor = { ...config, presetId: "cursor-agent", env: {} };
		const client = () => ({
			settings: {
				forkAgentSetup: {
					inspect: {
						query: async () => ({
							command: "/provider/cursor-agent",
							revision: "a".repeat(64),
							cursorApiKeySupported: supported,
						}),
					},
					configure: {
						mutate: async (input: unknown) => {
							calls.push(input);
						},
					},
				},
				agentConfigs: { list: { query: async () => [cursor] } },
			},
		});
		const view = renderHook(
			() =>
				useForkAgentSetup(
					"http://local",
					cursor,
					client as unknown as typeof getHostServiceClientByUrl,
				),
			{ wrapper: f.wrapper },
		);
		await flush();
		if (supported) {
			await act(async () => {
				await view.result.current.apply.mutateAsync({
					key: "cursor-key-fixture",
					model: "unused",
				});
			});
			expect(calls[0]).toMatchObject({ cursorApiKey: "cursor-key-fixture" });
			expect(calls[0]).not.toHaveProperty("api");
		} else {
			await act(async () => {
				await expect(
					view.result.current.apply.mutateAsync({
						key: "cursor-key-fixture",
						model: "unused",
					}),
				).rejects.toThrow("agent_setup_unavailable");
			});
			expect(calls).toEqual([]);
		}
		view.unmount();
		f.client.clear();
	}
});
