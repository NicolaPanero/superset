/**
 * Agent config id → the ACP harness that can run it as a chat. An agent absent
 * here simply has no chat surface; the pane falls back to its terminal.
 */
const ACP_HARNESS_BY_AGENT: Record<string, string> = {
	claude: "claude-acp",
	codex: "codex-acp",
	pi: "pi-acp",
	// Declared in the host's adapter table but not served yet: the toggle stays
	// hidden and the pane falls back to the terminal until they are.
	gemini: "gemini-acp",
	opencode: "opencode-acp",
};

/** The ACP harness that can resume this agent, if any can. */
export function acpHarnessForAgent(
	agentId: string | null | undefined,
): string | undefined {
	return agentId ? ACP_HARNESS_BY_AGENT[agentId] : undefined;
}
