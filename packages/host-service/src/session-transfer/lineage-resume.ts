import { realpath } from "node:fs/promises";
import type { HostDb } from "../db";
import {
	agentLaunchEnv,
	resolveHostAgentConfig,
} from "../terminal-agents/agent-config";
import { hasHarnessSession } from "../terminal-agents/harness-sessions";
import type { AgentRunInput } from "../trpc/router/agents/agents";
import type { LineageNode } from "./lineage";
import { pinNativeProfile } from "./registry";
import { defaultNativeStore, peerSessionReference } from "./stores";

export async function lineageResumeLaunch(
	db: HostDb,
	node: LineageNode,
	workspacePath: string,
): Promise<AgentRunInput> {
	const cwd = await realpath(workspacePath);
	if (cwd !== node.cwd) throw new Error("lineage_workspace_changed");
	const config = resolveHostAgentConfig(db, node.configId);
	if (!config || config.presetId !== node.agent || !config.resumeArgs.length)
		throw new Error("lineage_config_unavailable");
	let env = agentLaunchEnv(db, config);
	if (node.agent === "claude" || node.agent === "codex")
		env = pinNativeProfile(env, node.agent, node.profileOverride);
	if (node.agent === "cursor-agent") env = { ...env, CURSOR_AGENT: "1" };
	const root = await realpath(
		defaultNativeStore(node.agent, { ...process.env, ...env }),
	);
	if (root !== node.storeRoot) throw new Error("lineage_profile_changed");
	if (node.agent === "cursor-agent" || node.agent === "grok") {
		if (
			(await realpath(
				peerSessionReference(node.agent, root, node.sessionId, cwd),
			)) !== node.reference
		)
			throw new Error("lineage_session_unavailable");
	} else if (
		hasHarnessSession({
			agentId: node.agent,
			sessionId: node.sessionId,
			worktreePath: cwd,
			env,
		}) !== true
	)
		throw new Error("lineage_session_unavailable");
	return {
		workspaceId: node.workspaceId,
		agent: config.id,
		prompt: "",
		resumeSessionId: node.sessionId,
		launchSnapshot: { config, env },
	};
}
