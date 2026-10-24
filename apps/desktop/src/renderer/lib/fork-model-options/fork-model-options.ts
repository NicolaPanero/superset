import type { SessionConfigOption } from "@superset/chat/protocol";
import {
	type AgentModelOption,
	getAgentModelSupport,
} from "@superset/shared/agent-models";
import { getPresetIcon } from "renderer/assets/app-icons/preset-icons";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";

export const DEFAULT_OPTION_ID = "__default__";
export const MODEL_CONFIG_ID = "model";
export const EFFORT_CONFIG_ID = "effort";

export function agentLaunchPreset(agent: AgentSelectAgent) {
	return agent.launchPresetId ?? agent.presetId ?? agent.iconId ?? null;
}

export function agentChoices(
	agents: AgentSelectAgent[],
	isDark: boolean,
	catalogs?: Record<string, AgentModelOption[]>,
) {
	return agents.map((agent) => {
		const preset = agentLaunchPreset(agent);
		const iconId = agent.iconId ?? agent.presetId;
		return {
			presetId: agent.id,
			label: agent.label,
			icon: iconId ? getPresetIcon(iconId, isDark) : undefined,
			models: catalogs
				? (catalogs[agent.id] ?? [])
				: ((preset ? getAgentModelSupport(preset)?.models : undefined) ?? []),
		};
	});
}

function withDefault(
	options: AgentModelOption[],
	selected: string | null,
	defaultLabel: string,
) {
	return {
		currentValue:
			selected && options.some((option) => option.id === selected)
				? selected
				: DEFAULT_OPTION_ID,
		options: [
			{ id: DEFAULT_OPTION_ID, label: defaultLabel },
			...options.map(({ id, label }) => ({ id, label })),
		],
	};
}

export function creationConfigOptions({
	models,
	selectedModel,
	efforts,
	selectedEffort,
	labels,
	alwaysShowModel = false,
}: {
	models: AgentModelOption[];
	alwaysShowModel?: boolean;
	selectedModel: string | null;
	efforts: AgentModelOption[];
	selectedEffort: string | null;
	labels: {
		model: string;
		effort: string;
		defaultModel: string;
		defaultEffort: string;
	};
}): SessionConfigOption[] {
	const options: SessionConfigOption[] = [];
	if (models.length > 0 || alwaysShowModel) {
		options.push({
			id: MODEL_CONFIG_ID,
			label: labels.model,
			category: "model",
			...withDefault(models, selectedModel, labels.defaultModel),
		});
	}
	if (efforts.length > 0) {
		options.push({
			id: EFFORT_CONFIG_ID,
			label: labels.effort,
			category: "thought_level",
			...withDefault(efforts, selectedEffort, labels.defaultEffort),
		});
	}
	return options;
}

export function fromOptionValue(value: string) {
	return value === DEFAULT_OPTION_ID ? null : value;
}
