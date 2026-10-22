import { Trans, useLingui } from "@lingui/react/macro";
import { ContextMenuItem } from "@superset/ui/context-menu";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useRecentlyViewedFiles } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useRecentlyViewedFiles";
import { useRevealInFinder } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useRevealInFinder";
import { locatePath } from "../../../../../ChatPane/hooks/useOpenChatLink/utils/locatePath";
import { forkRevealChatLink } from "../../utils/forkRevealChatLink";

export function ForkRevealFileItem({
	text,
	workspaceId,
}: {
	text: string;
	workspaceId: string;
}) {
	const { t } = useLingui();
	const statPath = workspaceTrpc.filesystem.statPath.useMutation();
	const hostClient = workspaceTrpc.useUtils().client;
	const { recentFiles } = useRecentlyViewedFiles(workspaceId);
	const revealInFinder = useRevealInFinder(workspaceId);
	return (
		<ContextMenuItem
			onSelect={() =>
				void forkRevealChatLink(text, {
					locate: (path) =>
						locatePath(path, {
							stat: (target) =>
								statPath.mutateAsync({ workspaceId, path: target }),
							resolveFile: (reference) =>
								hostClient.filesystem.resolveFileReference.query({
									workspaceId,
									reference,
									preferredRelativePaths: recentFiles.map(
										(file) => file.relativePath,
									),
								}),
						}),
					reveal: revealInFinder,
					notFound: (path) =>
						toast.error(t({ message: `Path not found: ${path}` })),
					failed: () =>
						toast.error(t({ message: "Could not reach the workspace host" })),
				})
			}
		>
			<Trans>Reveal in Finder</Trans>
		</ContextMenuItem>
	);
}
