import { expect, test } from "bun:test";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import {
	act,
	flush,
	queryFixture,
	renderHook,
} from "renderer/test-utils/fork-ui";
import { useForkAccountLogin } from "./useForkAccountLogin";

const input = {
	hostUrl: "http://one.invalid",
	agent: "claude" as "claude" | "codex",
	credentialKind: "subscription" as const,
	loginId: "34c89ba6-f34e-41d4-b351-76f90b58a0d4",
	enabled: true,
};
const profile = {
	selection: "/profiles/.claude-work-example-com",
	label: "work@example.com",
	credentialKind: "subscription" as const,
};
function fixture(
	finish: (url: string) => Promise<typeof profile | null>,
	prepare: (url: string) => Promise<unknown> = async () => {},
) {
	const calls: Array<{ url: string; operation: string; input: unknown }> = [];
	const connect = (url: string) =>
		({
			usage: {
				finishAccountLogin: {
					mutate: async (value: unknown) => {
						calls.push({ url, operation: "finish", input: value });
						return finish(url);
					},
				},
				prepareAccount: {
					mutate: async (value: unknown) => {
						calls.push({ url, operation: "prepare", input: value });
						return prepare(url);
					},
				},
			},
		}) as unknown as HostServiceClient;
	const query = queryFixture();
	const hook = renderHook((props) => useForkAccountLogin(props, connect), {
		initialProps: input,
		wrapper: query.wrapper,
	});
	return { ...hook, calls };
}

test("waits for a completed sign-in before sharing settings or returning an account", async () => {
	let completed = false;
	const f = fixture(async () => (completed ? profile : null));
	await flush();
	expect(f.result.current.data).toBeNull();
	expect(f.calls.map((call) => call.operation)).toEqual(["finish"]);
	completed = true;
	await act(async () => {
		await f.result.current.refetch();
	});
	expect(f.result.current.data).toEqual(profile);
	expect(f.calls.at(-1)).toMatchObject({
		operation: "prepare",
		input: { agent: "claude", selection: profile.selection, isolated: true },
	});
});
test("an unsupported or inactive host never receives the new procedure", async () => {
	const query = queryFixture();
	const calls: unknown[] = [];
	renderHook(
		() =>
			useForkAccountLogin({ ...input, enabled: false }, (() => {
				calls.push(true);
				throw new Error("must not connect");
			}) as never),
		{ wrapper: query.wrapper },
	);
	await flush();
	expect(calls).toEqual([]);
});
test("changing host while naming is pending discards the old result before provisioning", async () => {
	let resolve!: (value: typeof profile) => void;
	const f = fixture(async (url) =>
		url === input.hostUrl
			? new Promise((r) => {
					resolve = r;
				})
			: null,
	);
	await flush();
	f.rerender({ ...input, hostUrl: "http://two.invalid" });
	await flush();
	resolve(profile);
	await flush();
	expect(f.calls.filter((call) => call.operation === "prepare")).toEqual([]);
	expect(f.result.current.data).toBeNull();
});
test("closing the dialog during sign-in does not provision or publish the late account", async () => {
	let resolve!: (value: typeof profile) => void;
	const f = fixture(
		async () =>
			new Promise((r) => {
				resolve = r;
			}),
	);
	await flush();
	f.unmount();
	resolve(profile);
	await flush();
	expect(f.calls.map((call) => call.operation)).toEqual(["finish"]);
});
test("switching provider starts a separate login and cannot adopt the old provider result", async () => {
	let resolve!: (value: typeof profile) => void;
	const f = fixture(
		async () =>
			new Promise((r) => {
				resolve = r;
			}),
	);
	await flush();
	const old = resolve;
	f.rerender({ ...input, agent: "codex" });
	await flush();
	old(profile);
	await flush();
	expect(f.calls.filter((call) => call.operation === "prepare")).toEqual([]);
	expect(f.calls.at(-1)?.input).toMatchObject({ agent: "codex" });
});
test("a setup error keeps the renamed profile unavailable until an explicit successful retry", async () => {
	let failed = true;
	const f = fixture(
		async () => profile,
		async () => {
			if (failed) throw new Error("setup unavailable");
		},
	);
	await flush();
	expect(f.result.current.isError).toBe(true);
	expect(f.result.current.data).toBeUndefined();
	failed = false;
	await act(async () => {
		await f.result.current.refetch();
	});
	expect(f.result.current.data).toEqual(profile);
	expect(
		f.calls
			.filter((call) => call.operation === "prepare")
			.map((call) => call.input),
	).toEqual([
		{ agent: "claude", selection: profile.selection, isolated: true },
		{ agent: "claude", selection: profile.selection, isolated: true },
	]);
});
test("a failed finalization never falls back to the default profile or prepares another account", async () => {
	const f = fixture(async () => {
		throw new Error("keychain denied");
	});
	await flush();
	expect(f.result.current.isError).toBe(true);
	expect(f.calls.map((call) => call.operation)).toEqual(["finish"]);
});
