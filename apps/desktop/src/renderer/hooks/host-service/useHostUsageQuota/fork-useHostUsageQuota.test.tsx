import { expect, test } from "bun:test";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import {
	act,
	flush,
	queryFixture,
	renderHook,
} from "renderer/test-utils/fork-ui";
import { type UsageAccount, useHostUsageQuota } from "./useHostUsageQuota";

let serial = 0;
function fixture(status: UsageAccount["status"] = "ok") {
	const url = `http://quota-${++serial}.invalid`,
		reads: unknown[] = [],
		verifications: unknown[] = [];
	let data: UsageAccount[] = [
		{
			agent: "claude",
			selection: "/work",
			credentialKind: "subscription",
			accountKey: "work",
			sourceLabel: "work",
			email: "work@example.invalid",
			plan: "max",
			status,
			statusDetail: null,
			windows: [
				{
					id: "five_hour",
					label: "Session",
					usedPercent: 20,
					resetsAt: new Date(Date.now() + 3600000),
				},
			],
			creditsBalance: null,
			extraUsage: null,
			isDefault: true,
			fetchedAt: new Date(),
		},
	];
	const connect = () =>
		({
			usage: {
				quota: {
					query: async (input: unknown) => {
						reads.push(input);
						return data;
					},
				},
				verifyAccount: {
					mutate: async (input: unknown) => {
						verifications.push(input);
						return { status: "checked" };
					},
				},
			},
		}) as unknown as HostServiceClient;
	return {
		url,
		connect,
		reads,
		verifications,
		setData: (next: UsageAccount[]) => {
			data = next;
		},
		getData: () => data,
		...queryFixture(),
	};
}
test("multiple visible consumers share the account request and manual refresh result", async () => {
	const f = fixture();
	const view = renderHook(
		() => [
			useHostUsageQuota(f.url, f.connect),
			useHostUsageQuota(f.url, f.connect),
		],
		{ wrapper: f.wrapper },
	);
	await flush();
	expect(f.reads).toHaveLength(1);
	expect(view.result.current[0]?.data).toEqual(view.result.current[1]?.data);
	f.setData(
		f.getData().map((row) => ({
			...row,
			windows: row.windows.map((window) => ({ ...window, usedPercent: 5 })),
		})),
	);
	await act(async () => {
		await view.result.current[0]?.refresh();
	});
	expect(f.reads.at(-1)).toEqual({ forceRefresh: true, isolated: true });
	expect(view.result.current[1]?.data?.[0]?.windows[0]?.usedPercent).toBe(5);
});
test("an expired token triggers one owner-account verification, even with multiple mounted screens", async () => {
	const f = fixture("token_stale");
	renderHook(
		() => [
			useHostUsageQuota(f.url, f.connect),
			useHostUsageQuota(f.url, f.connect),
		],
		{ wrapper: f.wrapper },
	);
	await flush();
	expect(f.verifications).toEqual([{ agent: "claude", selection: "/work" }]);
	expect(f.reads).toContainEqual({ forceRefresh: true, isolated: true });
	f.client.invalidateQueries();
	await flush();
	expect(f.verifications).toHaveLength(1);
});
test("signed-out accounts remain visible and never trigger an automatic login or model request", async () => {
	const f = fixture("signed_out");
	const view = renderHook(() => useHostUsageQuota(f.url, f.connect), {
		wrapper: f.wrapper,
	});
	await flush();
	expect(view.result.current.data?.[0]?.status).toBe("signed_out");
	expect(f.verifications).toEqual([]);
});
test("a missing local host starts no account requests", async () => {
	const f = fixture();
	const view = renderHook(() => useHostUsageQuota(null, f.connect), {
		wrapper: f.wrapper,
	});
	await flush();
	await act(async () => {
		await view.result.current.refresh();
	});
	expect(f.reads).toEqual([]);
	expect(f.verifications).toEqual([]);
});
