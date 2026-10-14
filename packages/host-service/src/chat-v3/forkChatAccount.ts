import {
	captureSessionAccount,
	type SessionAccount,
} from "../trpc/router/usage/session-account/session-account";

/** The login a chat agent runs on: the config directory its env points at. */
export function chatSessionAccount(
	agentId: string,
	env: NodeJS.ProcessEnv,
): Promise<SessionAccount | undefined> {
	const directory =
		agentId === "claude"
			? env.CLAUDE_CONFIG_DIR
			: agentId === "codex"
				? env.CODEX_HOME
				: undefined;
	return captureSessionAccount(
		agentId,
		directory ?? "",
		chatAccountUsesApiCredentials(agentId, env),
	).catch(() => undefined);
}

export function chatAccountUsesApiCredentials(
	agent: string,
	env: NodeJS.ProcessEnv,
): boolean {
	const keys =
		agent === "codex"
			? ["OPENAI_API_KEY", "CODEX_API_KEY"]
			: agent === "claude"
				? [
						"ANTHROPIC_API_KEY",
						"ANTHROPIC_AUTH_TOKEN",
						"CLAUDE_CODE_OAUTH_TOKEN",
					]
				: [];
	return keys.some((key) => Boolean(env[key]));
}
