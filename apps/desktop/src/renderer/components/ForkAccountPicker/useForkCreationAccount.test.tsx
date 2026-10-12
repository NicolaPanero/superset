import { afterEach, expect, test } from "bun:test";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import { useNewWorkspaceDraftStore } from "renderer/stores/new-workspace-draft";
import {
	act,
	flush,
	queryFixture,
	renderHook,
} from "renderer/test-utils/fork-ui";
import { useForkCreationAccount } from "./useForkCreationAccount";

const initial = {
	url: "http://one.invalid",
	agent: "claude-config",
	provider: "claude",
	model: "sonnet",
	reset: 0,
};
afterEach(() => useNewWorkspaceDraftStore.getState().resetDraft());
function fixture(validation?: () => Promise<unknown>) {
	const calls: unknown[] = [];
	const connect = (url: string) =>
		({
			agents: {
				accountOptions: {
					query: async () => [
						{ selection: "/work", label: "Work" },
						{ selection: "/personal", label: "Personal" },
					],
				},
			},
			usage: {
				quota: { query: async () => [] },
				launchAccount: {
					query: async (input: unknown) => {
						calls.push({ url, input });
						if ((input as { validate?: boolean }).validate && validation)
							return validation();
						return {
							isolationVersion: 1,
							defaultSelection: url === initial.url ? "/work" : "/remote",
							environmentOverride: false,
						};
					},
				},
			},
		}) as unknown as HostServiceClient;
	const query = queryFixture();
	const hook = renderHook(
		(p) =>
			useForkCreationAccount(
				p.url,
				p.agent,
				p.provider,
				p.model,
				p.reset,
				connect,
			),
		{ initialProps: initial, wrapper: query.wrapper },
	);
	return { ...hook, calls };
}
test("uses the host default and preserves a manual choice across model changes", async () => {
	const f = fixture();
	await flush();
	expect(f.result.current.selection).toBe("/work");
	act(() => f.result.current.choose("/personal"));
	f.rerender({ ...initial, model: "opus" });
	await flush();
	expect(f.result.current.selection).toBe("/personal");
	expect(await f.result.current.confirm()).toBe(true);
	expect(f.calls.at(-1)).toMatchObject({
		url: initial.url,
		input: { selection: "/personal", isolated: true, validate: true },
	});
});
test("a new creation resets to the effective default", async () => {
	const f = fixture();
	await flush();
	act(() => f.result.current.choose("/personal"));
	f.rerender({ ...initial, reset: 1 });
	await flush();
	expect(f.result.current.selection).toBe("/work");
});
test("switching hosts discards the old manual choice even after switching back", async () => {
	const f = fixture();
	await flush();
	act(() => f.result.current.choose("/personal"));
	f.rerender({ ...initial, url: "http://remote.invalid" });
	await flush();
	expect(f.result.current.selection).toBe("/remote");
	f.rerender(initial);
	await flush();
	expect(f.result.current.selection).toBe("/work");
});
test("changing provider uses its default and does not revive an earlier choice", async () => {
	const f = fixture();
	await flush();
	act(() => f.result.current.choose("/personal"));
	f.rerender({ ...initial, provider: "codex", agent: "codex-config" });
	await flush();
	expect(f.result.current.selection).toBe("/work");
	f.rerender(initial);
	await flush();
	expect(f.result.current.selection).toBe("/work");
});
test("cloud and other agents expose no local account selection", async () => {
	const f = fixture();
	await flush();
	act(() => f.result.current.choose("/personal"));
	f.rerender({ ...initial, url: null as unknown as string });
	await flush();
	expect(f.result.current.enabled).toBe(false);
	expect(f.result.current.selection).toBeUndefined();
	f.rerender({ ...initial, provider: "grok" });
	await flush();
	expect(f.result.current.enabled).toBe(false);
	expect(await f.result.current.confirm()).toBe(true);
});

test.each([
	"account",
	"model",
	"unmount",
])("pending launch validation is invalidated by %s changes", async (action) => {
	let finish!: (value: unknown) => void;
	const f = fixture(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	await flush();
	const pending = f.result.current.confirm();
	if (action === "account") act(() => f.result.current.choose("/personal"));
	if (action === "model") f.rerender({ ...initial, model: "opus" });
	if (action === "unmount") f.unmount();
	finish({
		isolationVersion: 1,
		defaultSelection: "/work",
		environmentOverride: false,
	});
	expect(await pending).toBe(false);
});
