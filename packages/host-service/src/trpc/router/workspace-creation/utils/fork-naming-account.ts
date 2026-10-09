import { envOverlayPrefix } from "@superset/shared/agent-prompt-launch";
import {
	agentLaunchEnv,
	resolveHostAgentConfig,
} from "../../../../terminal-agents/agent-config";
import { applyForkLaunchChoices } from "../../agents/fork-launch";
import type { WorkspaceNamingAgentContext } from "./ai-workspace-names";

export async function namingAccountCommand(
	context: WorkspaceNamingAgentContext,
	command: string,
) {
	const launch = await applyForkLaunchChoices(context.db, {
		agent: context.agent,
		workspaceId: "naming",
		prompt: "",
		accountSelection: context.accountSelection,
	});
	const config = resolveHostAgentConfig(context.db, context.agent);
	const env =
		launch.launchSnapshot?.env ??
		(config ? agentLaunchEnv(context.db, config) : undefined);
	if (!env) return command;
	return `${envOverlayPrefix(env)}${command}`;
}
