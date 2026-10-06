import { getAgentModelSupport } from "@superset/shared/agent-models";
import { TRPCError } from "@trpc/server";
import type { HostDb } from "../../../db";
import { waitForTerminalBaseEnv } from "../../../terminal/env";
import {
	agentLaunchEnv,
	resolveHostAgentConfig,
} from "../../../terminal-agents/agent-config";
import { selectedAccountEnv } from "./account-selection";
import type { AgentRunInput } from "./agents";

// Runtime launch details are deliberately labelled as launch choices, not as
// the active model (a CLI can change models later). Missing/evicted data is unknown.
export const launchDetails = new Map<
	string,
	{
		workspaceId: string;
		agent: string;
		configId: string;
		label: string;
		model: string | null;
	}
>();

export function terminalLaunchConfigId(
	workspaceId: string,
	terminalId: string,
	agent: string,
) {
	const details = launchDetails.get(terminalId);
	return details?.workspaceId === workspaceId && details.agent === agent
		? details.configId
		: undefined;
}

/** Records what a terminal agent was launched with, for the agent overview. */
export function recordLaunchDetails(
	db: HostDb,
	input: AgentRunInput,
	terminalId: string,
	label: string,
): void {
	const config =
		input.launchSnapshot?.config ?? resolveHostAgentConfig(db, input.agent);
	if (config) {
		const support = getAgentModelSupport(config.presetId);
		const flagIndex = support?.modelFlag
			? config.args.lastIndexOf(support.modelFlag)
			: -1;
		const configuredModel =
			flagIndex >= 0 ? config.args[flagIndex + 1] : undefined;
		launchDetails.set(terminalId, {
			workspaceId: input.workspaceId,
			agent: config.presetId,
			configId: config.id,
			label,
			model: input.model ?? configuredModel ?? null,
		});
		while (launchDetails.size > 1024) {
			const oldest = launchDetails.keys().next().value;
			if (oldest) launchDetails.delete(oldest);
		}
	}
}

/** Applies the launch account and the Cursor CLI identity to a terminal run. */
export async function applyForkLaunchChoices(
	db: HostDb,
	input: AgentRunInput,
): Promise<AgentRunInput> {
	if (input.accountSelection !== undefined) {
		await waitForTerminalBaseEnv();
		const config = resolveHostAgentConfig(db, input.agent);
		if (!config)
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "account_selection_unavailable",
			});
		const env = await selectedAccountEnv(
			config,
			agentLaunchEnv(db, config),
			input.accountSelection,
		);
		input = { ...input, launchSnapshot: { config, env } };
	}
	// CLI identity applies to plain launches as well as native handoffs.
	const launchConfig =
		input.launchSnapshot?.config ?? resolveHostAgentConfig(db, input.agent);
	if (launchConfig?.presetId === "cursor-agent") {
		input = {
			...input,
			launchSnapshot: {
				config: launchConfig,
				env: {
					...(input.launchSnapshot?.env ?? agentLaunchEnv(db, launchConfig)),
					CURSOR_AGENT: "1",
				},
			},
		};
	}
	return input;
}

/**
 * Open bindings whose agent has already quit. An agent that exits before its
 * first hook (Claude's folder trust prompt) never reports an end.
 */
export function exitedAgentTerminalIds(
	bindings: Array<{ terminalId: string; endedAt?: number }>,
	isLive: (terminalId: string) => boolean,
	isRunning: (terminalId: string) => boolean,
): string[] {
	return bindings
		.filter(
			(binding) =>
				!binding.endedAt &&
				isLive(binding.terminalId) &&
				!isRunning(binding.terminalId),
		)
		.map((binding) => binding.terminalId);
}
