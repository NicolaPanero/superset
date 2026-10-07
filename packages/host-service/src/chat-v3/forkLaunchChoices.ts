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
	) => { presetId: string } | null = resolveHostAgentConfig,
): { agentConfigId?: string; accountSelection?: string | null } {
	if (!options.agentConfigId) return {};
	const config = resolve(db, options.agentConfigId);
	const expected = ACP_HARNESSES[harness]?.binary;
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
