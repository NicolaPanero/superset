import type { ExternalApp } from "@superset/local-db";

export async function forkChooseAndOpenEditor(
	path: string,
	open: (path: string, editor: ExternalApp) => Promise<void>,
	remember: (editor: ExternalApp) => void,
	choose = async (): Promise<ExternalApp | null> =>
		(await import("./fork-editor-menu")).chooseForkEditor(),
): Promise<void> {
	const editor = await choose();
	if (!editor) return;
	await open(path, editor);
	remember(editor);
}
