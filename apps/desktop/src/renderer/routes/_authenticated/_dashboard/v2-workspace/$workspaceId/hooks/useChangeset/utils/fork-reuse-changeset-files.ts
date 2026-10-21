import { getChangesetFileKey } from "../changesetFileKey";
import type { ChangesetFile } from "../types";

function sameFile(a: ChangesetFile, b: ChangesetFile) {
	return (
		a.path === b.path &&
		a.oldPath === b.oldPath &&
		a.status === b.status &&
		a.additions === b.additions &&
		a.deletions === b.deletions &&
		a.isBinary === b.isBinary &&
		getChangesetFileKey(a) === getChangesetFileKey(b)
	);
}

/**
 * Every status snapshot decodes into new objects. Keep the previous object for
 * an unchanged file, and the previous array when nothing changed, so memoized
 * rows and lists skip the render.
 */
export function forkReuseChangesetFiles(
	previous: readonly ChangesetFile[],
	next: ChangesetFile[],
): ChangesetFile[] {
	if (!previous.length) return next;
	const byKey = new Map(
		previous.map((file) => [getChangesetFileKey(file), file]),
	);
	let changed = previous.length !== next.length;
	const files = next.map((file, index) => {
		const old = byKey.get(getChangesetFileKey(file));
		const kept = old && sameFile(old, file) ? old : file;
		if (kept !== previous[index]) changed = true;
		return kept;
	});
	return changed ? files : (previous as ChangesetFile[]);
}
