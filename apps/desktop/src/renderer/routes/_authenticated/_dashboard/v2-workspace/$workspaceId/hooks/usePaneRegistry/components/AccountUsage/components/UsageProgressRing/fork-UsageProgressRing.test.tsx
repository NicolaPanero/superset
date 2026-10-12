import { expect, test } from "bun:test";
import { render } from "renderer/test-utils/fork-ui";
import { UsageProgressRing } from "./UsageProgressRing";

test("the last known reading keeps its percentage with a visible freshness distinction", () => {
	const view = render(<UsageProgressRing usedPercent={94} lastKnown />);
	const circles = view.container.querySelectorAll("circle");
	expect(circles).toHaveLength(2);
	expect(circles[0]?.getAttribute("stroke-dasharray")).toBe("2 2");
	expect(circles[1]?.getAttribute("stroke-dasharray")).toBe("94 100");
	expect(circles[1]?.getAttribute("opacity")).toBe("0.65");
	view.rerender(<UsageProgressRing usedPercent={96} />);
	const fresh = view.container.querySelectorAll("circle");
	expect(fresh[0]?.hasAttribute("stroke-dasharray")).toBe(false);
	expect(fresh[1]?.getAttribute("stroke-dasharray")).toBe("96 100");
	expect(fresh[1]?.hasAttribute("opacity")).toBe(false);
});

test("an unknown reading has no quota arc even if a caller supplied a percentage", () => {
	const view = render(<UsageProgressRing usedPercent={94} unavailable />);
	expect(view.container.querySelectorAll("circle")).toHaveLength(1);
	expect(
		view.container.querySelector("circle")?.getAttribute("stroke-dasharray"),
	).toBe("2 2");
});
