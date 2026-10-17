import type { RendererContext } from "@superset/panes";
import { type ReactNode, useCallback } from "react";
import type { PaneViewerData, TerminalPaneData } from "../../../../types";
import type { OpenAgentChat } from "../../../useAgentSessionLauncher/useAgentSessionLauncher";
import { ForkAccountSwitchProvider } from "../ChatSession/providers/ForkAccountSwitchProvider";
import { ForkChatProvenanceProvider } from "../ChatSession/providers/ForkChatProvenanceProvider";
import {
	type ForkComposerControls,
	ForkComposerControlsProvider,
} from "../ChatSession/providers/ForkComposerControlsProvider";
import { ForkSessionControls } from "./components/ForkSessionControls";
import { useChatProvenance } from "./hooks/useChatProvenance";
import { useForkAccountSwitch } from "./hooks/useForkAccountSwitch";
import { forkChatContext } from "./utils/forkChatContext/forkChatContext";

/** The fork's additions to an agent chat: its composer controls and its origin. */
export function ForkChatExtras({
	ctx,
	workspaceId,
	openAgentChat,
	children,
}: {
	ctx: RendererContext<PaneViewerData>;
	workspaceId: string;
	openAgentChat: OpenAgentChat;
	children: ReactNode;
}) {
	const fork = forkChatContext(ctx);
	const data = fork.pane.data as TerminalPaneData;
	const controls = useCallback<ForkComposerControls>(
		(props) => (
			<ForkSessionControls
				ctx={fork}
				workspaceId={workspaceId}
				data={data}
				openAgentChat={openAgentChat}
				{...props}
			/>
		),
		[fork, workspaceId, data, openAgentChat],
	);
	const accountSwitcher = useForkAccountSwitch(workspaceId, fork);
	const provenance = useChatProvenance(
		workspaceId,
		fork.pane.data as TerminalPaneData,
	);
	return (
		<ForkAccountSwitchProvider value={accountSwitcher}>
			<ForkChatProvenanceProvider value={provenance}>
				<ForkComposerControlsProvider value={controls}>
					{children}
				</ForkComposerControlsProvider>
			</ForkChatProvenanceProvider>
		</ForkAccountSwitchProvider>
	);
}
