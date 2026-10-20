export function chatRecoveryCapabilities(agent: string) {
	const managed = agent === "claude" || agent === "codex";
	return { switchAccounts: managed, resumeAtReset: managed };
}
