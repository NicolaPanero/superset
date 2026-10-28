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
	expect(view.container.textContent).toContain("99%");
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
	expect(view.container.querySelector("[role=progressbar]")).toBeNull();
});
test("an idle reading stays current; failing refreshes label it last known after 30 minutes", () => {
	const idle = render(
		<ForkUsageSummary
			compact
			account={account({ fetchedAt: new Date(Date.now() - 360000) })}
		/>,
	);
	expect(idle.container.textContent).not.toContain("Last known");
	const failing = render(
		<ForkUsageSummary
			compact
			account={account({
				status: "unavailable",
				fetchedAt: new Date(Date.now() - 31 * 60_000),
			})}
		/>,
	);
	expect(failing.container.textContent).toContain("Last known");
	expect(failing.container.querySelector("[role=progressbar]")).not.toBeNull();
});
test("a signed-out identity takes precedence over a cached quota value", () => {
	const view = render(
		<ForkUsageSummary compact account={account({ status: "signed_out" })} />,
	);
	expect(view.container.textContent).toContain("Signed out");
	expect(view.container.querySelector("[role=progressbar]")).toBeNull();
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
	expect(view.container.textContent).not.toContain("Quota exhausted");
	view.rerender(<ForkUsageSummary compact model="sonnet" account={row} />);
	expect(view.container.textContent).toContain("Quota exhausted");
});
test("the full view draws one bar per window with its reset time", () => {
	const row = account({
		windows: [
			{
				id: "five_hour",
				label: "Session (5h)",
				usedPercent: 27,
				resetsAt: new Date(Date.now() + 3 * 3600000),
			},
			{
				id: "seven_day",
				label: "Weekly",
				usedPercent: 100,
				resetsAt: new Date(Date.now() + 9 * 3600000),
			},
		],
	});
	const view = render(<ForkUsageSummary account={row} />);
	const bars = view.container.querySelectorAll("[role=progressbar]");
	expect(bars).toHaveLength(2);
	expect(bars[0]?.getAttribute("aria-valuenow")).toBe("27");
	expect(bars[1]?.getAttribute("aria-valuenow")).toBe("100");
	expect(view.container.textContent).toContain("Session (5h)");
	expect(view.container.textContent).toContain("Weekly");
	expect(view.container.textContent).toContain("Resets in");
	expect(view.container.textContent).toContain("Quota exhausted");
});
test("the compact view shows the session and weekly bars side by side", () => {
	const row = account({
		windows: [
			{
				id: "five_hour",
				label: "Session (5h)",
				usedPercent: 4,
				resetsAt: null,
			},
			{ id: "seven_day", label: "Weekly", usedPercent: 23, resetsAt: null },
			{
				id: "seven_day_sonnet",
				label: "Weekly · Sonnet",
				usedPercent: 10,
				resetsAt: null,
			},
		],
	});
	const view = render(<ForkUsageSummary compact account={row} />);
	expect(view.container.querySelectorAll("[role=progressbar]")).toHaveLength(2);
	expect(view.container.textContent).toContain("5h");
	expect(view.container.textContent).toContain("7d");
});
