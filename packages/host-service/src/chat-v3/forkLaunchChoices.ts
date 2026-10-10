import type { HostDb } from "../db";
import { resolveHostAgentConfig } from "../terminal-agents/agent-config";
import { ACP_HARNESSES } from "./acpCatalogue";

/**
 * The launch config and account a chat pane saved, when they belong to the
 * harness being started. Switching a pane to another agent keeps the previous
 * agent's choices; those are dropped so the new agent starts on its defaults.
 */
export function forkLaunchChoices(
	db: HostDb,
	harness: string,
	options: { agentConfigId?: string; accountSelection?: string | null },
	resolve: (
		db: HostDb,
		id: string,
	) => { id?: string; presetId: string } | null = resolveHostAgentConfig,
): { agentConfigId?: string; accountSelection?: string | null } {
	const expected = ACP_HARNESSES[harness]?.binary;
	if (!options.agentConfigId) {
		if (options.accountSelection === undefined) return {};
		const config = expected ? resolve(db, expected) : null;
		if (!config || config.presetId !== expected)
			throw new Error("agent_config_unavailable");
		return {
			agentConfigId: config.id ?? expected,
			accountSelection: options.accountSelection,
		};
	}
	const config = resolve(db, options.agentConfigId);
	if (!config) throw new Error("agent_config_unavailable");
	const owned =
		config &&
		(config.presetId === expected ||
			(harness === "claude-acp" && config.presetId === "claude"));
	return owned
		? {
				agentConfigId: options.agentConfigId,
				accountSelection: options.accountSelection,
			}
		: {};
}
