import {
	type AccountCredentialKind,
	apiBillingLoginCommand,
} from "../apiBilling";
import { windowsLoginCommand } from "../forkWindowsLogin/forkWindowsLogin";
import type { ManagedAgent } from "../visibleQuotaAgents";

/**
 * The terminal command that signs a new profile dir into the agent. $HOME
 * stays unexpanded on purpose — the user's shell resolves it, so the same
 * command works over SSH to a remote host.
 */
export function addAccountCommand(
	agent: ManagedAgent,
	slug: string,
	credentialKind: AccountCredentialKind,
	markCompleted = false,
	platform?: string,
	keyPrompt?: string,
): string {
	if (!/^[a-z0-9][a-z0-9-]*$/.test(slug))
		throw new Error("account_profile_name_invalid");
	if (platform === "win32")
		return windowsLoginCommand({
			agent,
			slug,
			credentialKind,
			markCompleted,
			keyPrompt,
		});
	const dir =
		agent === "claude" ? `"$HOME/.claude-${slug}"` : `"$HOME/.codex-${slug}"`;
	const completed = markCompleted
		? ` && printf ${agent}:${slug} > ${dir}/.superset-login-complete`
		: "";
	if (credentialKind === "api_key") {
		return `mkdir -p ${dir} && ${apiBillingLoginCommand(agent, dir)}${completed}`;
	}
	if (agent === "claude") {
		return `CLAUDE_CONFIG_DIR=${dir} claude auth login${completed}`;
	}
	return `mkdir -p ${dir} && CODEX_HOME=${dir} codex login${completed}`;
}
