import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useMemo } from "react";
import { useSelectedRepoStore } from "../../state/selectedRepoStore";
import { pickFolderForPath } from "./pickFolderForPath";

/** Extra folders of the workspace's project, addressed through this workspace. */
export function useWorkspaceFolders(workspaceId: string) {
	const query = workspaceTrpc.projectFolders.listForWorkspace.useQuery(
		{ workspaceId },
		{ refetchOnWindowFocus: true },
	);
	const folders = useMemo(
		() => (query.data ?? []).filter((folder) => folder.exists),
		[query.data],
	);
	const selectedKey = useSelectedRepoStore((state) => state.keys[workspaceId]);
	const selected =
		folders.find((folder) => folder.workspaceKey === selectedKey) ?? null;
	/** Workspace key whose filesystem root holds `absolutePath`; the workspace's own id when none does. */
	const workspaceKeyForPath = useCallback(
		(absolutePath: string) =>
			pickFolderForPath(folders, absolutePath)?.workspaceKey ?? workspaceId,
		[folders, workspaceId],
	);
	return { folders, selected, workspaceKeyForPath };
}
