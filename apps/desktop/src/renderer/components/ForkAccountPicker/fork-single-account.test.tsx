import { expect, test } from "bun:test";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import {
	act,
	fireEvent,
	flush,
	queryFixture,
	render,
} from "renderer/test-utils/fork-ui";
import { ForkAccountSubmenu } from "./components/ForkAccountSubmenu";
import { ForkAccountPicker } from "./ForkAccountPicker";
import { useForkCreationAccount } from "./useForkCreationAccount";

test.each([
	"compact",
	"submenu",
] as const)("the %s picker opens usage with one Codex account", async (surface) => {
	const usage: UsageAccount = {
		agent: "codex",
		selection: "/work",
		credentialKind: "subscription",
		accountKey: "work",
		sourceLabel: "Work",
		email: "work@example.invalid",
		plan: "plus",
		status: "ok",
		statusDetail: null,
		windows: [
			{
				id: "five_hour",
				label: "Session (5h)",
				usedPercent: 25,
				resetsAt: null,
			},
		],
		creditsBalance: null,
		extraUsage: null,
		isDefault: true,
		fetchedAt: new Date(),
	};
	const client = {
		agents: {
			accountOptions: {
				query: async () => [{ selection: "/work", label: "Work" }],
			},
		},
		usage: {
			quota: { query: async () => [usage] },
			launchAccount: {
				query: async () => ({
					isolationVersion: 1,
					defaultSelection: "/work",
					environmentOverride: false,
				}),
			},
		},
	} as unknown as HostServiceClient;
	const query = queryFixture();
	const root = createRootRoute({
		component: function AccountPickerFixture() {
			const account = useForkCreationAccount(
				"http://host.invalid",
				"codex",
				"codex",
				null,
				0,
				() => client,
			);
			return surface === "compact" ? (
				<ForkAccountPicker account={account} provider="codex" compact />
			) : (
				<DropdownMenu defaultOpen>
					<DropdownMenuTrigger>Accounts</DropdownMenuTrigger>
					<DropdownMenuContent>
						<ForkAccountSubmenu account={account} provider="codex" />
					</DropdownMenuContent>
				</DropdownMenu>
			);
		},
	});
	const router = createRouter({
		routeTree: root,
		history: createMemoryHistory(),
	});
	await act(async () => {
		await router.load();
	});
	const view = render(<RouterProvider router={router} />, {
		wrapper: query.wrapper,
	});
	await flush();
	if (surface === "compact") {
		const trigger = view.getByRole("button", {
			name: usage.email as string,
		}) as HTMLButtonElement;
		expect(trigger.disabled).toBe(false);
		fireEvent.keyDown(trigger, { key: "Enter" });
	} else {
		fireEvent.keyDown(
			view.getByRole("menuitem", { name: /Account.*work@example.invalid/ }),
			{ key: "ArrowRight" },
		);
	}
	await flush();
	expect(view.getByRole("menuitem", { name: /Refresh/ })).toBeDefined();
	expect(view.getByRole("menuitem", { name: /Add account/ })).toBeDefined();
	expect(view.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
		"25",
	);
});
