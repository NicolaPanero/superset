import { expect, test } from "bun:test";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import { fireEvent, flush, render } from "renderer/test-utils/fork-ui";
import { ForkAccountResets } from "./ForkAccountResets";
import type { useForkAccountResets } from "./hooks/useForkAccountResets";

const account: UsageAccount = {
	agent: "codex",
	selection: "/profile",
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
	isDefault: false,
	fetchedAt: new Date(),
};
function fixture() {
	const inputs: unknown[] = [];
	let fail = false;
	const data = {
		status: "ready",
		identity: "a".repeat(64),
		email: account.email,
		availableCount: 1,
		credits: [{ id: "credit-1", expiresAt: new Date(Date.now() + 3600000) }],
		fetchedAt: new Date(),
		pendingAttempt: null,
	};
	const hook = () => ({
		data,
		enabled: true,
		isError: false,
		isPending: false,
		consume: {
			isPending: false,
			mutate: (
				input: unknown,
				callbacks: { onSuccess: (value: unknown) => void; onError: () => void },
			) => {
				inputs.push(input);
				if (fail) callbacks.onError();
				else callbacks.onSuccess({ outcome: "reset" });
			},
		},
	});
	return {
		data,
		inputs,
		fail: () => {
			fail = true;
		},
		hook: hook as unknown as typeof useForkAccountResets,
	};
}
test("displaying availability and opening confirmation never redeem a reset", async () => {
	const f = fixture();
	const view = render(
		<ForkAccountResets
			hostUrl="http://host.invalid"
			account={account}
			useResets={f.hook}
		/>,
	);
	expect(view.getByText(/Free resets:/)).toBeDefined();
	fireEvent.click(view.getByRole("button", { name: "Use reset" }));
	await flush();
	const dialog = view.getByRole("dialog");
	expect(dialog.textContent).toContain(account.email as string);
	expect(f.inputs).toHaveLength(0);
	fireEvent.click(view.getByRole("button", { name: "Cancel" }));
	await flush();
	expect(f.inputs).toHaveLength(0);
});
test("explicit confirmation redeems once and reports successful refresh", async () => {
	const f = fixture();
	const view = render(
		<ForkAccountResets
			hostUrl="http://host.invalid"
			account={account}
			useResets={f.hook}
		/>,
	);
	fireEvent.click(view.getByRole("button", { name: "Use reset" }));
	await flush();
	fireEvent.click(
		view.getAllByRole("button", { name: "Use reset" }).at(-1) as HTMLElement,
	);
	await flush();
	expect(f.inputs).toHaveLength(1);
	expect(view.getByRole("status").textContent).toContain("Reset applied");
});
test("retry after an uncertain result preserves the operation key", async () => {
	const f = fixture();
	f.fail();
	const view = render(
		<ForkAccountResets
			hostUrl="http://host.invalid"
			account={account}
			useResets={f.hook}
		/>,
	);
	fireEvent.click(view.getByRole("button", { name: "Use reset" }));
	await flush();
	fireEvent.click(
		view.getAllByRole("button", { name: "Use reset" }).at(-1) as HTMLElement,
	);
	await flush();
	fireEvent.click(
		view.getAllByRole("button", { name: "Use reset" }).at(-1) as HTMLElement,
	);
	await flush();
	expect(f.inputs).toHaveLength(2);
	expect(f.inputs[0]).toEqual(f.inputs[1]);
});
test("a changed profile closes the old confirmation before a reset can be used", async () => {
	const f = fixture();
	const view = render(
		<ForkAccountResets
			hostUrl="http://host.invalid"
			account={account}
			useResets={f.hook}
		/>,
	);
	fireEvent.click(view.getByRole("button", { name: "Use reset" }));
	await flush();
	view.rerender(
		<ForkAccountResets
			hostUrl="http://host.invalid"
			account={{
				...account,
				selection: "/other",
				email: "other@example.invalid",
			}}
			useResets={f.hook}
		/>,
	);
	await flush();
	expect(view.queryByRole("dialog")).toBeNull();
	expect(f.inputs).toHaveLength(0);
});
test("Claude opens its usage website with an account reminder and no Codex redemption", () => {
	const f = fixture();
	const view = render(
		<ForkAccountResets
			hostUrl="http://host.invalid"
			account={{ ...account, agent: "claude" }}
			useResets={f.hook}
		/>,
	);
	expect(view.getByRole("link").getAttribute("href")).toBe(
		"https://claude.ai/settings/usage",
	);
	expect(view.queryByRole("button", { name: "Use reset" })).toBeNull();
	expect(f.inputs).toHaveLength(0);
});
test("zero availability leaves no empty section; API billing has no free-reset controls", () => {
	const f = fixture();
	f.data.availableCount = 0;
	f.data.credits = [];
	const view = render(
		<ForkAccountResets
			hostUrl="http://host.invalid"
			account={account}
			useResets={f.hook}
		/>,
	);
	expect(view.container.textContent).toBe("");
	view.rerender(
		<ForkAccountResets
			hostUrl="http://host.invalid"
			account={{ ...account, credentialKind: "api_key" }}
			useResets={f.hook}
		/>,
	);
	expect(view.container.textContent).toBe("");
});

test("a hidden-email confirmation requires revealing the account before redemption", async () => {
	const f = fixture();
	const view = render(
		<ForkAccountResets
			hostUrl="http://host.invalid"
			account={account}
			hideEmail
			useResets={f.hook}
		/>,
	);
	fireEvent.click(view.getByRole("button", { name: "Use reset" }));
	await flush();
	const confirm = view
		.getAllByRole("button", { name: "Use reset" })
		.at(-1) as HTMLButtonElement;
	expect(confirm.disabled).toBe(true);
	expect(view.getByRole("dialog").textContent).not.toContain(
		account.email as string,
	);
	fireEvent.click(view.getByRole("button", { name: "Show emails" }));
	await flush();
	expect(confirm.disabled).toBe(false);
	expect(view.getByRole("dialog").textContent).toContain(
		account.email as string,
	);
	expect(f.inputs).toHaveLength(0);
});
