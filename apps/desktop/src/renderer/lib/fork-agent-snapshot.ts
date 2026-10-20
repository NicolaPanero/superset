import {
	type AgentLaunchConfig,
	getAgentCommandText,
} from "./agent-launch-command";

export function getForkAgentSnapshotCommand(config: AgentLaunchConfig): string {
	const {
		XAI_API_KEY: _grokKey,
		CURSOR_API_KEY: _cursorKey,
		CURSOR_AUTH_TOKEN: _cursorToken,
		...env
	} = config.env ?? {};
	return getAgentCommandText({ ...config, env });
}
