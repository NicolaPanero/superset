import { Trans } from "@lingui/react/macro";
import { useForkBranchBase } from "renderer/hooks/host-service/useForkBranchBase";

export function ForkBranchBaseNotice({ workspaceId }: { workspaceId: string }) {
	const base = useForkBranchBase(workspaceId);
	if (!base.data.needsSelection) return null;
	return (
		<p className="mx-3 mt-2 rounded-md border bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
			<Trans>
				Choose a base branch to compare committed changes. Only local changes
				are shown until you choose.
			</Trans>
		</p>
	);
}
