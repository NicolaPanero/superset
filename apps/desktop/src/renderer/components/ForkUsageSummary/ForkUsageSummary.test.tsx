import { expect, test } from "bun:test";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import { render } from "renderer/test-utils/fork-ui";
import { ForkUsageSummary } from "./ForkUsageSummary";

function account(patch: Partial<UsageAccount> = {}): UsageAccount {
	return {
		agent: "claude",
		selection: "/work",
		credentialKind: "subscription",
		accountKey: "work",
		sourceLabel: "work",
		email: "work@example.invalid",
		plan: "max",
		status: "ok",
		statusDetail: null,
		windows: [
			{
				id: "five_hour",
				label: "Session (5h)",
				usedPercent: 99.99,
				resetsAt: new Date(Date.now() + 3600000),
			},
		],
		creditsBalance: null,
		extraUsage: null,
		isDefault: true,
		fetchedAt: new Date(),
		...patch,
	};
}
test("a value rounded to 100 percent is not incorrectly labelled exhausted", () => {
	const view = render(<ForkUsageSummary compact account={account()} />);
	expect(view.container.textContent).not.toContain("Quota exhausted");
	expect(view.container.textContent).toContain("available");
	view.rerender(
		<ForkUsageSummary
			compact
			account={account({
				windows: [
					{
						id: "five_hour",
						label: "Session",
						usedPercent: 100,
						resetsAt: null,
					},
				],
			})}
		/>,
	);
	expect(view.container.textContent).toContain("Quota exhausted");
});
test.each([
	undefined,
	account({ windows: [] }),
])("missing quota never displays a free account", (row) => {
	const view = render(<ForkUsageSummary compact account={row} />);
	expect(view.container.textContent).toContain("Unverified");
	expect(view.container.textContent).not.toContain("available");
});
test("old readings retain their value but are visibly labelled last known", () => {
	const view = render(
		<ForkUsageSummary
			compact
			account={account({ fetchedAt: new Date(Date.now() - 360000) })}
		/>,
	);
	expect(view.container.textContent).toContain("Last known");
	expect(view.container.textContent).not.toContain("available");
});
test("a signed-out identity takes precedence over a cached quota value", () => {
	const view = render(
		<ForkUsageSummary compact account={account({ status: "signed_out" })} />,
	);
	expect(view.container.textContent).toContain("Signed out");
	expect(view.container.textContent).not.toContain("available");
});
test("API billing, credit balances and extra spending remain distinct", () => {
	const view = render(
		<ForkUsageSummary
			account={account({
				credentialKind: "api_key",
				creditsBalance: 0,
				extraUsage: { usedCents: 0, limitCents: 1000 },
			})}
		/>,
	);
	expect(view.container.textContent).toContain("API billing");
	expect(view.container.textContent).toContain("Credits");
	expect(view.container.textContent).toContain("Extra usage");
});
test("model-specific exhaustion is visible only for the affected model", () => {
	const row = account({
		windows: [
			{ id: "five_hour", label: "Session", usedPercent: 20, resetsAt: null },
			{
				id: "seven_day_sonnet",
				label: "Sonnet",
				usedPercent: 100,
				resetsAt: null,
			},
		],
	});
	const view = render(<ForkUsageSummary compact model="opus" account={row} />);
	expect(view.container.textContent).toContain("available");
	view.rerender(<ForkUsageSummary compact model="sonnet" account={row} />);
	expect(view.container.textContent).toContain("Quota exhausted");
});
