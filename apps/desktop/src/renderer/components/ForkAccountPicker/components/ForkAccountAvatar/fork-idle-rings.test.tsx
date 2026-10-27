import { expect, test } from "bun:test";
import { accountQuotaRings } from "@superset/shared/fork-account-usage";
import { render } from "renderer/test-utils/fork-ui";
import { ForkAccountAvatar } from "./ForkAccountAvatar";

test("an idle sample keeps both arcs current; failed refreshes dim them after 30 minutes", () => {
	const now = Date.now();
	const account = {
		agent: "codex",
		credentialKind: "subscription",
		status: "ok",
		fetchedAt: new Date(now),
		windows: [
			{ id: "primary", label: "Session (5h)", usedPercent: 25, resetsAt: null },
			{ id: "secondary", label: "Weekly", usedPercent: 60, resetsAt: null },
		],
	};
	const idle = now + 31 * 60_000;
	const view = render(
		<ForkAccountAvatar
			label="Work"
			{...accountQuotaRings(account, undefined, idle)}
		/>,
	);
	expect(view.getByRole("img").getAttribute("aria-label")).not.toContain(
		"Last known",
	);
	expect(
		view.container.querySelectorAll('circle[opacity="0.65"]'),
	).toHaveLength(0);
	view.rerender(
		<ForkAccountAvatar
			label="Work"
			{...accountQuotaRings(
				{ ...account, status: "unavailable" },
				undefined,
				idle,
			)}
		/>,
	);
	expect(view.getByRole("img").getAttribute("aria-label")).toContain(
		"Last known",
	);
	expect(
		view.container.querySelectorAll("circle[stroke-dashoffset]"),
	).toHaveLength(2);
	expect(
		view.container.querySelectorAll('circle[opacity="0.65"]'),
	).toHaveLength(2);
	view.rerender(
		<ForkAccountAvatar
			label="Work"
			{...accountQuotaRings(
				{ ...account, fetchedAt: new Date(idle) },
				undefined,
				idle,
			)}
		/>,
	);
	expect(view.getByRole("img").getAttribute("aria-label")).not.toContain(
		"Last known",
	);
	expect(
		view.container.querySelectorAll("circle[stroke-dashoffset]"),
	).toHaveLength(2);
	expect(
		view.container.querySelectorAll('circle[opacity="0.65"]'),
	).toHaveLength(0);
});
