import {
	type AgentLaunchConfig,
	getAgentCommandText,
} from "./agent-launch-command";

export function getForkAgentSnapshotCommand(config: AgentLaunchConfig): string {
	if (config.presetId !== "grok" || !config.env?.XAI_API_KEY)
		return getAgentCommandText(config);
	const { XAI_API_KEY, ...env } = config.env;
	return getAgentCommandText({ ...config, env });
}
