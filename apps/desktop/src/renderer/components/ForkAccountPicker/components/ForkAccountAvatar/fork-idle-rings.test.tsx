import { expect, test } from "bun:test";
import { accountQuotaRings } from "@superset/shared/fork-account-usage";
import { render } from "renderer/test-utils/fork-ui";
import { ForkAccountAvatar } from "./ForkAccountAvatar";

test("returning after inactivity keeps both arcs visible until a new quota sample arrives", () => {
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
	const idle = now + 10 * 60_000;
	const view = render(
		<ForkAccountAvatar
			label="Work"
			{...accountQuotaRings(account, undefined, now)}
		/>,
	);
	view.rerender(
		<ForkAccountAvatar
			label="Work"
			{...accountQuotaRings(account, undefined, idle)}
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
