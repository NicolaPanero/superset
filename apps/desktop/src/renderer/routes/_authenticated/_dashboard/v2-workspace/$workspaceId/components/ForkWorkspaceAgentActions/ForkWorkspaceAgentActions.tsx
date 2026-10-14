import { Trans, useLingui } from "@lingui/react/macro";
import type { WorkspaceStore } from "@superset/panes";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Import } from "lucide-react";
import { useEffect, useState } from "react";
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
	importRequested = false,
	onImportRequestConsumed,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	workspaceId: string;
	workspaceName: string;
	launchOpen: boolean;
	importRequested?: boolean;
	onImportRequestConsumed?: () => void;
	onLaunchOpenChange: (open: boolean) => void;
	onCreateNewAgentSession: CreateNewAgentSession;
}) {
	const { t } = useLingui();
	const [importOpen, setImportOpen] = useState(false);
	useEffect(() => {
		if (!importRequested) return;
		setImportOpen(true);
		onImportRequestConsumed?.();
	}, [importRequested, onImportRequestConsumed]);
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
						<Import className="size-4" />
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
