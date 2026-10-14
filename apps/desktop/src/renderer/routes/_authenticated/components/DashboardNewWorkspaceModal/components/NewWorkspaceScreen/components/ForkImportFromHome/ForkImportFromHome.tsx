import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Spinner } from "@superset/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { Import } from "lucide-react";
import { useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { importWorkspace } from "./importWorkspace";

export function ForkImportFromHome({
	hostUrl,
	projectId,
}: {
	hostUrl: string | null;
	projectId: string | null | undefined;
}) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const [busy, setBusy] = useState(false);
	const open = async () => {
		if (!hostUrl || !projectId || busy) return;
		setBusy(true);
		try {
			const workspaceId = await importWorkspace(
				getHostServiceClientByUrl(hostUrl),
				projectId,
			);
			await navigateToV2Workspace(workspaceId, navigate, {
				search: { importChat: true },
			});
		} catch (error) {
			toast.error(t({ message: "Couldn't import the chat" }), {
				description: errorMessage(error, t({ message: "Unknown error" })),
			});
		} finally {
			setBusy(false);
		}
	};
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-7 text-muted-foreground"
						aria-label={t({ message: "Find a chat" })}
						disabled={!hostUrl || !projectId || busy}
						onClick={() => void open()}
					>
						{busy ? (
							<Spinner className="size-4" />
						) : (
							<Import className="size-4" />
						)}
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
	);
}
