import type { SessionConfigOption } from "@superset/chat/protocol";
import type { RendererContext } from "@superset/panes";
import { useCallback, useRef } from "react";
import type { PaneViewerData, TerminalPaneData } from "../../../../../../types";
import { forkChatModelPick } from "../../utils/forkChatModelPick";

/** The picker's onSelect, plus the pick kept in the pane data for the next resume. */
export function useForkPersistChatModel({
	ctx,
	data,
	configOptions,
	onSelect,
}: {
	ctx: RendererContext<PaneViewerData>;
	data: TerminalPaneData;
	configOptions: SessionConfigOption[];
	onSelect?: (configId: string, value: string) => void;
}): ((configId: string, value: string) => void) | undefined {
	const latest = useRef({ ctx, data, configOptions });
	latest.current = { ctx, data, configOptions };
	const select = useCallback(
		(configId: string, value: string) => {
			onSelect?.(configId, value);
			const current = latest.current;
			const next = forkChatModelPick(
				current.data,
				current.configOptions,
				configId,
				value,
			);
			if (next) current.ctx.actions.updateData(next);
		},
		[onSelect],
	);
	return onSelect ? select : undefined;
}
