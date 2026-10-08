import type { RendererContext } from "@superset/panes";
import type { ReactNode } from "react";
import type { PaneViewerData, TerminalPaneData } from "../../../../types";
import { ForkAccountSwitchProvider } from "../ChatSession/providers/ForkAccountSwitchProvider";
import { ForkChatProvenanceProvider } from "../ChatSession/providers/ForkChatProvenanceProvider";
import { useChatProvenance } from "./hooks/useChatProvenance";
import { useForkAccountSwitch } from "./hooks/useForkAccountSwitch";

/** The fork's additions to an agent chat: its account menu and its origin. */
export function ForkChatExtras({
	ctx,
	workspaceId,
	children,
}: {
	ctx: RendererContext<PaneViewerData>;
	workspaceId: string;
	children: ReactNode;
}) {
	const accountSwitcher = useForkAccountSwitch(workspaceId, ctx);
	const provenance = useChatProvenance(
		workspaceId,
		ctx.pane.data as TerminalPaneData,
	);
	return (
		<ForkAccountSwitchProvider value={accountSwitcher}>
			<ForkChatProvenanceProvider value={provenance}>
				{children}
			</ForkChatProvenanceProvider>
		</ForkAccountSwitchProvider>
	);
}
