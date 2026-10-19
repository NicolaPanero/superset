import type { RendererContext } from "@superset/panes";
import type { PaneViewerData } from "../../../../types";
import { ForkChatOriginBadge } from "./components/ForkChatOriginBadge";
import { useForkChatOrigin } from "./hooks/useForkChatOrigin";

/** Where a handed-over chat came from, in its pane header. */
export function ForkChatOrigin({
	ctx,
	workspaceId,
}: {
	ctx: RendererContext<PaneViewerData>;
	workspaceId: string;
}) {
	const origin = useForkChatOrigin(ctx, workspaceId);
	return origin ? <ForkChatOriginBadge origin={origin} /> : null;
}
