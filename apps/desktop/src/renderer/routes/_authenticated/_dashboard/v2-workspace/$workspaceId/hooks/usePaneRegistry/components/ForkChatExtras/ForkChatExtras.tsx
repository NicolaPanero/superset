import type { RendererContext } from "@superset/panes";
import type { ReactNode } from "react";
import type { PaneViewerData, TerminalPaneData } from "../../../../types";
import { ForkAccountSwitchProvider } from "../ChatSession/providers/ForkAccountSwitchProvider";
import { ForkChatProvenanceProvider } from "../ChatSession/providers/ForkChatProvenanceProvider";
import { useChatProvenance } from "./hooks/useChatProvenance";
import { useForkAccountSwitch } from "./hooks/useForkAccountSwitch";
import { forkChatContext } from "./utils/forkChatContext/forkChatContext";

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
	const fork = forkChatContext(ctx);
	const accountSwitcher = useForkAccountSwitch(workspaceId, fork);
	const provenance = useChatProvenance(
		workspaceId,
		fork.pane.data as TerminalPaneData,
	);
	return (
		<ForkAccountSwitchProvider value={accountSwitcher}>
			<ForkChatProvenanceProvider value={provenance}>
				{children}
			</ForkChatProvenanceProvider>
		</ForkAccountSwitchProvider>
	);
}
