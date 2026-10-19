/**
 * Pasted and dropped files of unsent chat drafts. The composer unmounts when
 * its tab is hidden; text survives in storage, and these keep the files with
 * it. Memory only: files are too large for renderer storage, and an entry
 * goes as soon as its draft has no files.
 */
const drafts = new Map<string, File[]>();

export function forkDraftFiles(draftKey: string) {
	return {
		initial: drafts.get(draftKey) ?? [],
		onChange: (files: File[]) => {
			if (files.length > 0) drafts.set(draftKey, files);
			else drafts.delete(draftKey);
		},
	};
}
