import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import { getPresetById } from "@superset/shared/host-agent-presets";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { hostAgentConfigs } from "../../../db/schema";
import {
	getTerminalBaseEnv,
	waitForTerminalBaseEnv,
} from "../../../terminal/env";
import { resolveHostAgentConfig } from "../../../terminal-agents/agent-config";
import { protectedProcedure, queryProcedure, router } from "../../index";
import { inspectAgentSetup, type SetupAgent } from "./fork-agent-setup-probe";

export function recommendedSetupPatch(
	agent: SetupAgent,
	command: string,
	existingEnv: Record<string, string>,
	api?: { key: string; model: string },
) {
	const preset = getPresetById(agent);
	if (!preset || !isAbsolute(command))
		throw new Error("agent_setup_unavailable");
	return {
		command,
		args: api ? ["--model", api.model] : [],
		promptTransport: preset.promptTransport,
		promptArgs: preset.promptArgs,
		resumeArgs: preset.resumeArgs,
		forkArgs: preset.forkArgs,
		env: api
			? {
					...existingEnv,
					XAI_API_KEY: api.key,
					GROK_MODELS_BASE_URL: "https://api.x.ai/v1",
					GROK_MODELS_LIST_URL: "https://api.x.ai/v1/models",
				}
			: existingEnv,
	};
}
export function setupRevision(
	row: typeof hostAgentConfigs.$inferSelect | undefined,
) {
	return createHash("sha256")
		.update(JSON.stringify(row ?? null))
		.digest("hex");
}
export function createForkAgentSetupRouter(inspect = inspectAgentSetup) {
	const id = z.object({ configId: z.string().min(1) });
	const resolve = (
		db: Parameters<typeof resolveHostAgentConfig>[0],
		configId: string,
	) => {
		const config = resolveHostAgentConfig(db, configId);
		if (
			!config ||
			config.id !== configId ||
			(config.presetId !== "grok" && config.presetId !== "cursor-agent")
		)
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "agent_setup_unavailable",
			});
		return config as typeof config & { presetId: SetupAgent };
	};
	return router({
		inspect: queryProcedure
			.meta({ timeoutMs: 30000 })
			.input(id)
			.query(async ({ ctx, input }) => {
				const config = resolve(ctx.db, input.configId);
				await waitForTerminalBaseEnv();
				const row = ctx.db
					.select()
					.from(hostAgentConfigs)
					.where(eq(hostAgentConfigs.id, config.id))
					.get();
				return {
					...(await inspect(config.presetId, {
						...getTerminalBaseEnv(),
						...config.env,
					})),
					revision: setupRevision(row),
				};
			}),
		configure: protectedProcedure
			.input(
				id.extend({
					expectedCommand: z.string().min(1),
					expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
					api: z
						.object({
							key: z.string().trim().min(1).max(8192),
							model: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/),
						})
						.optional(),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				const config = resolve(ctx.db, input.configId);
				const row = ctx.db
					.select()
					.from(hostAgentConfigs)
					.where(eq(hostAgentConfigs.id, config.id))
					.get();
				if (setupRevision(row) !== input.expectedRevision)
					throw new TRPCError({
						code: "CONFLICT",
						message: "agent_setup_changed",
					});
				if (input.api && config.presetId !== "grok")
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "agent_setup_unavailable",
					});
				await waitForTerminalBaseEnv();
				const probe = await inspect(config.presetId, {
					...getTerminalBaseEnv(),
					...config.env,
				});
				if (!probe.command || probe.command !== input.expectedCommand)
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: "agent_setup_changed",
					});
				if (input.api && probe.modelOverrides)
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: "agent_setup_model_credentials",
					});
				const patch = recommendedSetupPatch(
					config.presetId,
					probe.command,
					config.env,
					input.api,
				);
				ctx.db.transaction((tx) => {
					const current = tx
						.select()
						.from(hostAgentConfigs)
						.where(eq(hostAgentConfigs.id, config.id))
						.get();
					if (setupRevision(current) !== input.expectedRevision)
						throw new TRPCError({
							code: "CONFLICT",
							message: "agent_setup_changed",
						});
					const result = tx
						.update(hostAgentConfigs)
						.set({
							command: patch.command,
							argsJson: JSON.stringify(patch.args),
							promptTransport: patch.promptTransport,
							promptArgsJson: JSON.stringify(patch.promptArgs),
							resumeArgsJson: JSON.stringify(patch.resumeArgs),
							forkArgsJson: JSON.stringify(patch.forkArgs),
							envJson: JSON.stringify(patch.env),
							updatedAt: Math.max(Date.now(), (row?.updatedAt ?? 0) + 1),
						})
						.where(eq(hostAgentConfigs.id, config.id))
						.run();
					if (result.changes !== 1)
						throw new TRPCError({
							code: "CONFLICT",
							message: "agent_setup_changed",
						});
				});
				return { success: true as const };
			}),
	});
}
export const forkAgentSetupRouter = createForkAgentSetupRouter();
