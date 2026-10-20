import { isWithinWorkspacePath } from "shared/absolute-paths";

export function pickFolderForPath<T extends { path: string }>(
	folders: T[],
	absolutePath: string,
): T | null {
	let best: T | null = null;
	for (const folder of folders) {
		if (!isWithinWorkspacePath(folder.path, absolutePath)) continue;
		if (!best || folder.path.length > best.path.length) best = folder;
	}
	return best;
}
