import { resolveAgentLaunchPresetId } from "@superset/shared/agent-models";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { acpHarnessForPreset } from "../chat-v3/acpCatalogue";
import { resolveHostAgentConfig } from "../terminal-agents/agent-config";
import {
	type AgentRunInput,
	runAgentInWorkspace,
	validateAgentLaunchOptions,
} from "../trpc/router/agents";
import { launchChatAgent } from "../trpc/router/agents/agents";
import { applyForkLaunchChoices } from "../trpc/router/agents/fork-launch";
import type { HostServiceContext } from "../types";
import { getLocalWorkspace } from "../workspaces/local-workspace-store";

export const forkJiraLaunchSchema = z.object({
	surface: z.enum(["terminal", "chat"]),
	model: z.string().min(1).optional(),
	accountSelection: z.string().min(1).optional(),
});

export async function prepareForkJiraLaunch(
	ctx: HostServiceContext,
	agent: string,
	launch: z.infer<typeof forkJiraLaunchSchema>,
): Promise<AgentRunInput> {
	const input = { agent, prompt: "", workspaceId: "", ...launch };
	const config = resolveHostAgentConfig(ctx.db, agent);
	if (!config)
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Agent configuration not found",
		});
	validateAgentLaunchOptions(ctx.db, input);
	if (launch.surface === "chat") {
		const harness = acpHarnessForPreset(
			resolveAgentLaunchPresetId(config.presetId, config.command),
		);
		if (!harness || !ctx.runtime.chat?.()?.live.supports(harness))
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message: "ACP chat is unavailable for this agent on this host",
			});
	}
	return applyForkLaunchChoices(ctx.db, input);
}

export async function launchForkJiraAgent(
	ctx: HostServiceContext,
	input: AgentRunInput,
) {
	if (input.surface !== "chat") return runAgentInWorkspace(ctx, input);
	const workspace = getLocalWorkspace(ctx.db, input.workspaceId);
	if (!workspace || workspace.archivedAt)
		throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
	const result = launchChatAgent(ctx, input, workspace.worktreePath);
	if (!result)
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "ACP chat is unavailable for this agent on this host",
		});
	return result;
}
