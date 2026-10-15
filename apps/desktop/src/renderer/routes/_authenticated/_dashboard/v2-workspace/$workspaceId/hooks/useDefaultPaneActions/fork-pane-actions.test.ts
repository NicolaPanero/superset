import { expect, test } from "bun:test";
import type { PaneActionConfig, RendererContext } from "@superset/panes";
import { renderHook } from "@testing-library/react";
import { useForkPaneActions } from "./fork-pane-actions";

const actions: PaneActionConfig<null>[] = ["split", "close"].map((key) => ({
	key,
	icon: null,
	onClick: () => {},
}));
const contextWith = (count: number) =>
	({
		tab: {
			panes: Object.fromEntries(
				Array.from({ length: count }, (_, index) => [`p${index}`, {}]),
			),
		},
	}) as unknown as RendererContext<null>;

test("the close button is hidden only when the pane is alone in its tab", () => {
	const { result } = renderHook(() => useForkPaneActions(actions));
	expect(result.current(contextWith(1)).map((action) => action.key)).toEqual([
		"split",
	]);
	expect(result.current(contextWith(2)).map((action) => action.key)).toEqual([
		"split",
		"close",
	]);
});
