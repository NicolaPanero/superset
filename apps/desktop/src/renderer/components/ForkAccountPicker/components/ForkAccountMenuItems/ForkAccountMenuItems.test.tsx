import { expect, test } from "bun:test";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Toaster } from "@superset/ui/sonner";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import {
	act,
	fireEvent,
	flush,
	queryFixture,
	render,
} from "renderer/test-utils/fork-ui";
import type { useForkCreationAccount } from "../../useForkCreationAccount";
import { ForkAccountMenuItems } from "./ForkAccountMenuItems";

function row(
	selection: string,
	status: UsageAccount["status"],
	fetchedAt: Date,
): UsageAccount {
	return {
		agent: "claude",
		selection,
		credentialKind: "subscription",
		accountKey: selection,
		sourceLabel: selection,
		email: `${selection.slice(1)}@example.invalid`,
		plan: null,
		status,
		statusDetail: null,
		windows:
			status === "ok"
				? [{ id: "five_hour", label: "5h", usedPercent: 10, resetsAt: null }]
				: [],
		creditsBalance: null,
		extraUsage: null,
		isDefault: false,
		fetchedAt,
	};
}

async function fixture(refreshed: () => UsageAccount[]) {
	const old = new Date(Date.now() - 60 * 60_000);
	const data = [row("/work", "ok", old), row("/gone", "signed_out", old)];
	const calls = { chosen: [] as (string | null)[], reconnect: [] as unknown[] };
	const account = {
		selection: "/work",
		options: {
			data: [
				{ selection: "/work", label: "Work" },
				{ selection: "/gone", label: "Gone" },
			],
			isSuccess: true,
		},
		quota: { data, refresh: async () => refreshed() },
		choose: (selection: string | null) => calls.chosen.push(selection),
		setReconnect: (target: unknown) => calls.reconnect.push(target),
		setAdding: () => {},
	} as unknown as ReturnType<typeof useForkCreationAccount>;
	const root = createRootRoute({
		component: () => (
			<>
				<Toaster />
				<DropdownMenu defaultOpen>
					<DropdownMenuTrigger>Accounts</DropdownMenuTrigger>
					<DropdownMenuContent>
						<ForkAccountMenuItems
							account={account}
							provider="claude"
							afterClose={(action) => action()}
						/>
					</DropdownMenuContent>
				</DropdownMenu>
			</>
		),
	});
	const router = createRouter({
		routeTree: root,
		history: createMemoryHistory(),
	});
	await act(async () => {
		await router.load();
	});
	const query = queryFixture();
	const view = render(<RouterProvider router={router} />, {
		wrapper: query.wrapper,
	});
	await flush();
	return { view, calls };
}

test("picking a signed-out account opens its sign-in instead of starting a switch that fails", async () => {
	const { view, calls } = await fixture(() => []);
	fireEvent.click(view.getByRole("menuitem", { name: /gone@example/ }));
	await flush();
	expect(calls.chosen).toEqual([]);
	expect(calls.reconnect).toEqual([
		{
			agent: "claude",
			credentialKind: "subscription",
			selection: "/gone",
			label: "gone@example.invalid",
		},
	]);
	view.unmount();
	const ready = await fixture(() => []);
	fireEvent.click(ready.view.getByRole("menuitem", { name: /work@example/ }));
	expect(ready.calls.chosen).toEqual(["/work"]);
	expect(ready.calls.reconnect).toEqual([]);
});

test("Refresh inside the provider read interval says when the next update is possible", async () => {
	const recent = row("/work", "ok", new Date(Date.now() - 60_000));
	const { view } = await fixture(() => [recent]);
	fireEvent.click(view.getByRole("menuitem", { name: /Refresh/ }));
	await flush();
	expect(document.body.textContent).toContain(
		"Usage is read at most every 5 minutes per account",
	);
});

test("Refresh shows progress and says when the provider returned no newer usage", async () => {
	let finish: (rows: UsageAccount[]) => void = () => {};
	const pending = new Promise<UsageAccount[]>((resolve) => {
		finish = resolve;
	});
	const stale = row("/work", "ok", new Date(Date.now() - 60 * 60_000));
	const { view } = await fixture(() => pending as unknown as UsageAccount[]);
	fireEvent.click(view.getByRole("menuitem", { name: /Refresh/ }));
	await flush();
	expect(view.getByRole("menuitem", { name: /Refreshing/ })).toBeDefined();
	await act(async () => {
		finish([stale]);
		await pending;
	});
	await flush();
	expect(view.getByRole("menuitem", { name: /^Refresh/ })).toBeDefined();
	expect(document.body.textContent).toContain(
		"The provider returned no new usage",
	);
});
