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
import {
	act,
	fireEvent,
	flush,
	queryFixture,
	render,
} from "renderer/test-utils/fork-ui";
import type { useForkCreationAccount } from "../../useForkCreationAccount";
import { ForkAccountMenuItems } from "./ForkAccountMenuItems";

test("choosing another account waits for the menu to close, so a dialog it opens keeps focus", async () => {
	const chosen: (string | null)[] = [];
	const queued: (() => void)[] = [];
	const account = {
		selection: "/work",
		options: {
			data: [
				{ selection: "/work", label: "Work" },
				{ selection: "/other", label: "Other" },
			],
			isSuccess: true,
		},
		quota: { data: [], refresh: async () => [] },
		choose: (selection: string | null) => chosen.push(selection),
		setReconnect: () => {},
		setAdding: () => {},
	} as unknown as ReturnType<typeof useForkCreationAccount>;
	const root = createRootRoute({
		component: () => (
			<DropdownMenu defaultOpen>
				<DropdownMenuTrigger>Accounts</DropdownMenuTrigger>
				<DropdownMenuContent>
					<ForkAccountMenuItems
						account={account}
						provider="claude"
						afterClose={(action) => queued.push(action)}
					/>
				</DropdownMenuContent>
			</DropdownMenu>
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
	fireEvent.click(view.getByRole("menuitem", { name: /Other/ }));
	await flush();
	expect(chosen).toEqual([]);
	expect(queued).toHaveLength(1);
	queued[0]?.();
	expect(chosen).toEqual(["/other"]);
});
