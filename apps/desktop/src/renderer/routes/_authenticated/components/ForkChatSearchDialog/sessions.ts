export type ExternalSession = {
	agent: string;
	sessionId: string;
	title: string | null;
	preview: string | null;
	timestamp: string;
	updatedAt: string | null;
	gitBranch: string | null;
	model: string | null;
	accountSelection: string | null;
	cwd: string | null;
	folder: string;
	workspaceId: string | null;
	inProjectRoot: boolean;
	inSuperset: boolean;
	terminalId?: string | null;
	storeRoot?: string;
};

export const PORTABLE = new Set(["claude", "codex"]);

export function accountName(selection: string | null) {
	if (!selection) return null;
	const name = selection.split("/").filter(Boolean).at(-1) ?? selection;
	return name.replace(/^\.(claude|codex)-?/, "") || name;
}

export function sessionKey(session: ExternalSession) {
	return `${session.agent}:${session.storeRoot ?? session.accountSelection ?? "default"}:${session.sessionId}`;
}
