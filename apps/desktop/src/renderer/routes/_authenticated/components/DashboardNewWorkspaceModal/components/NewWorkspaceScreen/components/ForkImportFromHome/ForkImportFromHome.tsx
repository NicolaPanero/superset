import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import {
	WorkspaceClientProvider,
	workspaceTrpc,
} from "@superset/workspace-client";
import { useNavigate } from "@tanstack/react-router";
import { Import } from "lucide-react";
import { useState } from "react";
import { useForkExternalSessions } from "renderer/hooks/host-service/useForkExternalSessions";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import {
	getHostServiceHeaders,
	getHostServiceWsToken,
} from "renderer/lib/host-service-auth";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import {
	type ExternalSession,
	ForkChatSearchDialog,
	sessionKey,
} from "renderer/routes/_authenticated/components/ForkChatSearchDialog";
import { importWorkspace } from "./importWorkspace";

export function ForkImportFromHome({
	hostUrl,
	projectId,
}: {
	hostUrl: string | null;
	projectId: string | null | undefined;
}) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const disabled = !hostUrl || !projectId;
	return (
		<>
			<Tooltip>
				<TooltipTrigger asChild>
					<span>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-7 text-muted-foreground"
							aria-label={t({ message: "Find a chat" })}
							disabled={disabled}
							onClick={() => setOpen(true)}
						>
							<Import className="size-4" />
						</Button>
					</span>
				</TooltipTrigger>
				<TooltipContent>
					{projectId ? (
						<Trans>Find a chat</Trans>
					) : (
						<Trans>Select a project first</Trans>
					)}
				</TooltipContent>
			</Tooltip>
			{open && hostUrl && projectId && (
				<WorkspaceClientProvider
					cacheKey="home-find-chat"
					key={hostUrl}
					hostUrl={hostUrl}
					headers={() => getHostServiceHeaders(hostUrl)}
					wsToken={() => getHostServiceWsToken(hostUrl)}
				>
					<HomeChatSearch
						hostUrl={hostUrl}
						projectId={projectId}
						onClose={() => setOpen(false)}
					/>
				</WorkspaceClientProvider>
			)}
		</>
	);
}

function HomeChatSearch({
	hostUrl,
	projectId,
	onClose,
}: {
	hostUrl: string;
	projectId: string;
	onClose: () => void;
}) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { data: configs = [] } = useV2AgentConfigs(hostUrl);
	const [busy, setBusy] = useState<string | null>(null);
	const listing = useForkExternalSessions({ projectId });
	const { data: capabilities } =
		workspaceTrpc.sessionTransfer.capabilities.useQuery(undefined, {
			retry: false,
			staleTime: 60_000,
		});
	const verified = (presetId: string) =>
		Boolean(
			capabilities?.nativeAvailable &&
				capabilities.adapters.find((adapter) => adapter.agent === presetId)
					?.verified,
		);
	const run = async (session: ExternalSession, configId: string) => {
		const key = sessionKey(session);
		setBusy(key);
		try {
			const workspaceId =
				session.workspaceId ??
				(await importWorkspace(getHostServiceClientByUrl(hostUrl), projectId));
			await navigateToV2Workspace(workspaceId, navigate, {
				search: { resumeChat: JSON.stringify({ key, configId }) },
			});
			onClose();
		} catch (error) {
			toast.error(t({ message: "Couldn't import the chat" }), {
				description: errorMessage(error, t({ message: "Unknown error" })),
			});
		} finally {
			setBusy(null);
		}
	};
	return (
		<ForkChatSearchDialog
			open
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
			sessions={(listing.data ?? []) as ExternalSession[]}
			isPending={listing.isPending}
			isFetching={listing.isFetching}
			error={listing.error?.message}
			loadingPreviews={listing.loadingPreviews}
			onRefresh={() => void listing.refetch()}
			configs={configs}
			verified={verified}
			busyKey={busy}
			currentWorkspaceId={null}
			onRun={run}
		/>
	);
}
