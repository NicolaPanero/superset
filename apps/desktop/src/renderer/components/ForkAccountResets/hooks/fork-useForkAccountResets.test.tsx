import { expect, test } from "bun:test";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import { HOST_USAGE_QUOTA_QUERY_KEY } from "renderer/hooks/host-service/useHostUsageQuota";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import {
	act,
	flush,
	queryFixture,
	renderHook,
} from "renderer/test-utils/fork-ui";
import { useForkAccountResets } from "./useForkAccountResets";

export function resetAccount(patch: Partial<UsageAccount> = {}): UsageAccount {
	return {
		agent: "codex",
		credentialKind: "subscription",
		accountKey: "profile",
		sourceLabel: "~/.codex-work",
		email: "work@example.invalid",
		plan: "plus",
		status: "ok",
		statusDetail: null,
		windows: [],
		creditsBalance: null,
		extraUsage: null,
		selection: "/profile",
		isDefault: true,
		fetchedAt: new Date(),
		...patch,
	};
}
let serial = 0;
function fixture() {
	const reads: unknown[] = [],
		uses: unknown[] = [];
	let fail = false;
	const host = `http://reset-${++serial}.invalid`;
	const connect = () =>
		({
			usage: {
				accountResets: {
					query: async (input: unknown) => {
						reads.push(input);
						if (fail) throw new Error("unsupported");
						return {
							status: "ready",
							identity: "a".repeat(64),
							email: "work@example.invalid",
							availableCount: 1,
							credits: null,
							fetchedAt: new Date(),
							pendingAttempt: null,
						};
					},
				},
				consumeAccountReset: {
					mutate: async (input: unknown) => {
						uses.push(input);
						return { outcome: "reset" };
					},
				},
			},
		}) as unknown as HostServiceClient;
	return {
		...queryFixture(),
		host,
		connect,
		reads,
		uses,
		fail: () => {
			fail = true;
		},
	};
}
test("visible views share reset discovery; reading never uses a reset", async () => {
	const f = fixture();
	const view = renderHook(
		() => [
			useForkAccountResets(f.host, resetAccount(), f.connect),
			useForkAccountResets(f.host, resetAccount(), f.connect),
		],
		{ wrapper: f.wrapper },
	);
	await flush();
	expect(f.reads).toHaveLength(1);
	expect(f.uses).toHaveLength(0);
	expect(view.result.current[0]?.data).toEqual(view.result.current[1]?.data);
});
test.each([
	resetAccount({ agent: "claude" }),
	resetAccount({ credentialKind: "api_key" }),
	resetAccount({ selection: null }),
	resetAccount({ status: "signed_out" }),
])("external, API, signed-out and Claude accounts do not query Codex resets", async (account) => {
	const f = fixture();
	renderHook(() => useForkAccountResets(f.host, account, f.connect), {
		wrapper: f.wrapper,
	});
	await flush();
	expect(f.reads).toHaveLength(0);
	expect(f.uses).toHaveLength(0);
});
test("older hosts fail locally without retries or automatic redemption", async () => {
	const f = fixture();
	f.fail();
	const view = renderHook(
		() => useForkAccountResets(f.host, resetAccount(), f.connect),
		{ wrapper: f.wrapper },
	);
	await flush();
	expect(view.result.current.isError).toBe(true);
	expect(f.reads).toHaveLength(1);
	expect(f.uses).toHaveLength(0);
});
test("redemption targets the displayed profile and refreshes the shared quota", async () => {
	const f = fixture();
	const quotaKey = [...HOST_USAGE_QUOTA_QUERY_KEY, f.host];
	f.client.setQueryData(quotaKey, []);
	const view = renderHook(
		() => useForkAccountResets(f.host, resetAccount(), f.connect),
		{ wrapper: f.wrapper },
	);
	await flush();
	await act(async () => {
		await view.result.current.consume.mutateAsync({
			expectedIdentity: "a".repeat(64),
			idempotencyKey: "5c55a376-5263-41c5-a86c-3994ee645b48",
			creditId: "credit-1",
		});
	});
	expect(f.uses).toEqual([
		{
			selection: "/profile",
			expectedIdentity: "a".repeat(64),
			idempotencyKey: "5c55a376-5263-41c5-a86c-3994ee645b48",
			creditId: "credit-1",
		},
	]);
	expect(f.client.getQueryState(quotaKey)?.isInvalidated).toBe(true);
	expect(f.reads).toHaveLength(2);
});
test("changing host or account never reuses a previous confirmation target", async () => {
	const f = fixture();
	const view = renderHook(
		({ host, account }) => useForkAccountResets(host, account, f.connect),
		{
			wrapper: f.wrapper,
			initialProps: { host: f.host, account: resetAccount() },
		},
	);
	await flush();
	view.rerender({
		host: "http://other.invalid",
		account: resetAccount({
			selection: "/other",
			email: "other@example.invalid",
		}),
	});
	await flush();
	expect(f.reads.at(-1)).toEqual({ selection: "/other" });
	expect(f.uses).toHaveLength(0);
});
