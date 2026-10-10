import { Trans, useLingui } from "@lingui/react/macro";
import type { WorkspaceStore } from "@superset/panes";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { History } from "lucide-react";
import { useState } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { CreateNewAgentSession } from "../../hooks/useAgentSessionLauncher";
import type { PaneViewerData } from "../../types";
import { ForkImportChatDialog } from "../ForkImportChatDialog";
import { ForkNewAgentDialog } from "../ForkNewAgentDialog";

export function ForkWorkspaceAgentActions({
	store,
	workspaceId,
	workspaceName,
	launchOpen,
	onLaunchOpenChange,
	onCreateNewAgentSession,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	workspaceId: string;
	workspaceName: string;
	launchOpen: boolean;
	onLaunchOpenChange: (open: boolean) => void;
	onCreateNewAgentSession: CreateNewAgentSession;
}) {
	const { t } = useLingui();
	const [importOpen, setImportOpen] = useState(false);
	return (
		<>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						aria-label={t({ message: "Find a chat" })}
						onClick={() => setImportOpen(true)}
					>
						<History className="size-4" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					<Trans>Find a chat</Trans>
				</TooltipContent>
			</Tooltip>
			{launchOpen && (
				<ForkNewAgentDialog
					open
					onOpenChange={onLaunchOpenChange}
					workspaceId={workspaceId}
					workspaceName={workspaceName}
					onCreateNewAgentSession={onCreateNewAgentSession}
				/>
			)}
			<ForkImportChatDialog
				open={importOpen}
				onOpenChange={setImportOpen}
				onImported={() => setImportOpen(false)}
				store={store}
				workspaceId={workspaceId}
			/>
		</>
	);
}
