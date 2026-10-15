import type { PaneActionConfig, RendererContext } from "@superset/panes";
import { useMemo } from "react";

export type ForkPaneActions<TData> = (
	context: RendererContext<TData>,
) => PaneActionConfig<TData>[];

export function useForkPaneActions<TData>(
	actions: PaneActionConfig<TData>[],
): ForkPaneActions<TData> {
	return useMemo(() => {
		const withoutClose = actions.filter((action) => action.key !== "close");
		return (context) =>
			Object.keys(context.tab.panes).length > 1 ? actions : withoutClose;
	}, [actions]);
}
