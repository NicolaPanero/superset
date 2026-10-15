import { Trans, useLingui } from "@lingui/react/macro";
import type { WorkspaceStore } from "@superset/panes";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Import } from "lucide-react";
import { useEffect, useState } from "react";
import { useHotkey } from "renderer/hotkeys";
import type { StoreApi } from "zustand/vanilla";
import type { CreateNewAgentSession } from "../../hooks/useAgentSessionLauncher";
import type { PaneViewerData } from "../../types";
import {
	ForkImportChatDialog,
	type ForkResumeRequest,
} from "../ForkImportChatDialog";
import { ForkNewAgentDialog } from "../ForkNewAgentDialog";

function parseResume(raw: string | undefined): ForkResumeRequest | undefined {
	if (!raw) return undefined;
	try {
		const value = JSON.parse(raw) as Partial<ForkResumeRequest>;
		return typeof value.key === "string" && typeof value.configId === "string"
			? { key: value.key, configId: value.configId }
			: undefined;
	} catch {
		return undefined;
	}
}

export function ForkWorkspaceAgentActions({
	store,
	workspaceId,
	workspaceName,
	launchOpen,
	onLaunchOpenChange,
	onCreateNewAgentSession,
	importRequested = false,
	resumeChat,
	onResumeConsumed,
	onImportRequestConsumed,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	workspaceId: string;
	workspaceName: string;
	launchOpen: boolean;
	importRequested?: boolean;
	resumeChat?: string;
	onResumeConsumed?: () => void;
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
	useHotkey("NEW_AGENT", () => onLaunchOpenChange(true));
	const resume = parseResume(resumeChat);
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
				resume={resume}
				onResumeConsumed={onResumeConsumed}
			/>
		</>
	);
}
