import type { SessionConfigOption } from "@superset/chat/protocol";
import {
	getAgentEffortSupport,
	getAgentModelSupport,
	resolveAgentLaunchPresetId,
} from "@superset/shared/agent-models";
import { TRPCError } from "@trpc/server";
import { getForkModelCatalog } from "../../../chat-v3/forkModelCatalog";
import type { HostDb } from "../../../db";
import { resolveHostAgentConfig } from "../../../terminal-agents/agent-config";

type Launch = {
	agent: string;
	model?: string;
	effort?: string;
	modelCatalog?: "agent";
	accountSelection?: string | null;
	workspaceId?: string;
};
interface Choices {
	models: SessionConfigOption["options"];
	efforts: SessionConfigOption["options"];
	modelArgs: string[];
	effortArgs: string[];
}
const verified = new WeakMap<object, Choices>();
export const forkCatalogChoices = (input: object) => verified.get(input);

export async function prepareForkCatalogLaunch<T extends Launch>(
	db: HostDb,
	input: T,
	context: { projectId?: string } = {},
	load: typeof getForkModelCatalog = getForkModelCatalog,
): Promise<T> {
	if (input.modelCatalog !== "agent" || (!input.model && !input.effort))
		return input;
	const config = resolveHostAgentConfig(db, input.agent);
	if (!config)
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "agent_config_unavailable",
		});
	const preset = resolveAgentLaunchPresetId(config.presetId, config.command);
	const catalog = await load(db, {
		agent: config.id,
		accountSelection: input.accountSelection,
		projectId: context.projectId,
		workspaceId:
			!context.projectId && input.workspaceId && input.workspaceId !== "pending"
				? input.workspaceId
				: undefined,
		model: input.model,
	});
	const models =
		catalog.configOptions.find((o) => o.category === "model")?.options ?? [];
	const efforts =
		catalog.configOptions.find((o) => o.category === "thought_level")
			?.options ?? [];
	if (input.model && !models.some((o) => o.id === input.model))
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"The selected model is no longer available. Refresh the model list.",
		});
	if (input.effort && !efforts.some((o) => o.id === input.effort))
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "The selected effort is not available for this model.",
		});
	const modelFlag = getAgentModelSupport(preset)?.modelFlag;
	const support = getAgentEffortSupport(preset);
	let model = input.model;
	if (preset === "cursor-agent" && input.effort) {
		model = `${model ?? catalog.configOptions.find((o) => o.category === "model")?.currentValue}[effort=${input.effort}]`;
	}
	verified.set(input, {
		models,
		efforts,
		modelArgs: model && modelFlag ? [modelFlag, model] : [],
		effortArgs:
			input.effort && support?.effortFlag
				? [
						support.effortFlag,
						`${support.effortValuePrefix ?? ""}${input.effort}`,
					]
				: [],
	});
	return input;
}
