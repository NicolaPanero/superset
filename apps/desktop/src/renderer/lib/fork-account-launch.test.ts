import { expect, test } from "bun:test";
import { validateAccountLaunch } from "./fork-account-launch";
import type { HostServiceClient } from "./host-service-client";

function host(read: (input: unknown) => Promise<unknown>) {
	return () =>
		({
			usage: { launchAccount: { query: read } },
		}) as unknown as HostServiceClient;
}
const request = {
	hostUrl: "http://fixture.invalid",
	agent: "config",
	provider: "claude",
	selection: "/profiles/work",
};
test("an explicit profile is validated on its host before the first prompt", async () => {
	const calls: unknown[] = [];
	expect(
		await validateAccountLaunch(
			request,
			host(async (input) => {
				calls.push(input);
				return { isolationVersion: 1 };
			}),
		),
	).toBe(true);
	expect(calls).toEqual([
		{
			agent: "config",
			selection: "/profiles/work",
			isolated: true,
			validate: true,
		},
	]);
});
test("missing isolated default asks for a choice while forced API configuration remains explicit", async () => {
	expect(
		await validateAccountLaunch(
			{ ...request, selection: undefined },
			host(async () => ({
				isolationVersion: 1,
				environmentOverride: false,
				defaultSelection: null,
			})),
		),
	).toBe(false);
	expect(
		await validateAccountLaunch(
			{ ...request, selection: undefined },
			host(async () => ({
				isolationVersion: 1,
				environmentOverride: true,
				defaultSelection: null,
			})),
		),
	).toBe(true);
});
test.each([
	"Reconnect account",
	"account_selection_unavailable",
	"account_environment_override",
])("launch fails closed for %s", async (message) => {
	expect(
		await validateAccountLaunch(
			request,
			host(async () => {
				throw new Error(message);
			}),
		),
	).toBe(false);
});
test("old hosts can retain their default but never silently ignore an explicit account", async () => {
	const missing = host(async () => {
		throw { data: { code: "NOT_FOUND" } };
	});
	expect(
		await validateAccountLaunch({ ...request, selection: undefined }, missing),
	).toBe(true);
	expect(await validateAccountLaunch(request, missing)).toBe(false);
	expect(
		await validateAccountLaunch({ ...request, selection: null }, missing),
	).toBe(false);
});
test("a choice changed while validation is pending never launches the old account", async () => {
	let current = true,
		finish!: (result: unknown) => void;
	const validation = validateAccountLaunch(
		{ ...request, isCurrent: () => current },
		host(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		),
	);
	current = false;
	finish({ isolationVersion: 1 });
	expect(await validation).toBe(false);
});
test("an outdated choice or credit-based provider makes no account RPC", async () => {
	let calls = 0;
	const connection = host(async () => {
		calls++;
		return {};
	});
	expect(
		await validateAccountLaunch(
			{ ...request, isCurrent: () => false },
			connection,
		),
	).toBe(false);
	for (const provider of ["cursor-agent", "grok"])
		expect(
			await validateAccountLaunch({ ...request, provider }, connection),
		).toBe(true);
	expect(calls).toBe(0);
});
