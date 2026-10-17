import type { RendererContext } from "@superset/panes";
import { type ReactNode, useCallback } from "react";
import type { PaneViewerData, TerminalPaneData } from "../../../../types";
import { markChatSessionClosed } from "../../../../utils/closedChatSessions";
import type { OpenAgentChat } from "../../../useAgentSessionLauncher/useAgentSessionLauncher";
import { useChatWiring } from "../ChatSession/hooks/useSessionClient";
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
import { forgetPreviousChat, usePreviousChat } from "./utils/previousChat";

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
	const lineage = useChatProvenance(workspaceId, data);
	const previous = usePreviousChat(data.terminalId);
	const wiring = useChatWiring();
	const returnToPrevious = useCallback(() => {
		if (!previous) return;
		if (data.acpSessionId) {
			markChatSessionClosed(data.acpSessionId);
			void wiring.transport
				.closeSession({ sessionId: data.acpSessionId })
				.catch(() => undefined);
		}
		forgetPreviousChat(data.terminalId);
		fork.actions.updateData(previous.data);
		fork.actions.setTitle(previous.label);
	}, [previous, data, fork, wiring.transport]);
	const provenance = previous
		? {
				label: lineage?.label ?? previous.label,
				email: lineage?.email ?? null,
				summaryOnly: previous.summaryOnly,
				onReturn: returnToPrevious,
			}
		: lineage;
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
