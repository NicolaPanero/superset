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
	return captureSessionAccount(agentId, directory ?? "", false).catch(
		() => undefined,
	);
}
