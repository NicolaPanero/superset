import type { RendererContext } from "@superset/panes";
import { type ReactNode, useCallback, useMemo } from "react";
import type { PaneViewerData, TerminalPaneData } from "../../../../types";
import type { OpenAgentChat } from "../../../useAgentSessionLauncher/useAgentSessionLauncher";
import { ForkAccountSwitchProvider } from "../ChatSession/providers/ForkAccountSwitchProvider";
import {
	type ForkComposerControls,
	ForkComposerControlsProvider,
} from "../ChatSession/providers/ForkComposerControlsProvider";
import { ForkSessionControls } from "./components/ForkSessionControls";
import { useForkAccountSwitch } from "./hooks/useForkAccountSwitch";
import { forkChatContext } from "./utils/forkChatContext/forkChatContext";

/** The fork's additions to an agent chat: its composer and account controls. */
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
	const fork = useMemo(() => forkChatContext(ctx), [ctx]);
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
	return (
		<ForkAccountSwitchProvider value={accountSwitcher}>
			<ForkComposerControlsProvider value={controls}>
				{children}
			</ForkComposerControlsProvider>
		</ForkAccountSwitchProvider>
	);
}
