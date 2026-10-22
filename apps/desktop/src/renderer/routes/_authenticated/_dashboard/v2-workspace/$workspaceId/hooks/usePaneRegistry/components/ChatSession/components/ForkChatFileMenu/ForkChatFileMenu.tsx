import { Trans } from "@lingui/react/macro";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import type { ReactElement } from "react";
import { useChatPaneActions } from "../../providers/ChatPaneActionsProvider";
import { ForkRevealFileItem } from "./components/ForkRevealFileItem";

const PLAIN_CLICK = { metaKey: false, ctrlKey: false, shiftKey: false };

export function ForkChatFileMenu({
	text,
	children,
}: {
	text: string;
	children: ReactElement;
}) {
	const { openLink, workspaceId } = useChatPaneActions();
	if (!workspaceId) return children;
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent className="w-48">
				{openLink ? (
					<ContextMenuItem
						onSelect={() =>
							openLink(text, { ...PLAIN_CLICK, clientX: 0, clientY: 0 })
						}
					>
						<Trans>Open</Trans>
					</ContextMenuItem>
				) : null}
				<ForkRevealFileItem text={text} workspaceId={workspaceId} />
			</ContextMenuContent>
		</ContextMenu>
	);
}
