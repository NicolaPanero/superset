const PREFIX = "pf~";
const SEPARATOR = "~";

export interface FolderWorkspaceRef {
	workspaceId: string;
	folderId: string;
}

/**
 * Names one extra project folder as seen from one workspace. It is accepted
 * wherever a `workspaceId` is, so git, filesystem and watcher code work on
 * the folder without a parallel API.
 */
export function folderWorkspaceId(ref: FolderWorkspaceRef): string {
	return `${PREFIX}${ref.workspaceId}${SEPARATOR}${ref.folderId}`;
}

export function parseFolderWorkspaceId(id: string): FolderWorkspaceRef | null {
	if (!id.startsWith(PREFIX)) return null;
	const [workspaceId, folderId, ...rest] = id
		.slice(PREFIX.length)
		.split(SEPARATOR);
	if (!workspaceId || !folderId || rest.length > 0) return null;
	return { workspaceId, folderId };
}
