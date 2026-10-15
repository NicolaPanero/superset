import { useLingui } from "@lingui/react/macro";
import {
	type AgentModelOption,
	getAgentModelSupport,
} from "@superset/shared/agent-models";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { useIsDarkTheme } from "renderer/assets/app-icons/preset-icons";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";
import {
	type AgentSwitcher,
	ModelPicker,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/components/Composer/components/ModelPicker";
import {
	MENU_PANEL_CLASS,
	MENU_ROW_CLASS,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/components/Composer/constants";
import {
	agentChoices,
	agentLaunchPreset,
	creationConfigOptions,
	EFFORT_CONFIG_ID,
	fromOptionValue,
	MODEL_CONFIG_ID,
} from "./utils/creationPickerOptions";

const NO_AGENT = "none";

export function ForkCreationModelPicker({
	agents,
	selectedAgent,
	onSelectAgent,
	selectedModel,
	onModelChange,
	efforts,
	selectedEffort,
	onEffortChange,
	renderAccountItem,
}: {
	agents: AgentSelectAgent[];
	selectedAgent: string;
	onSelectAgent: (agentId: string) => void;
	selectedModel: string | null;
	onModelChange: (model: string | null) => void;
	efforts: AgentModelOption[];
	selectedEffort: string | null;
	onEffortChange: (effort: string | null) => void;
	renderAccountItem?: (
		rowClassName: string,
		panelClassName: string,
	) => ReactNode;
}) {
	const { t } = useLingui();
	const isDark = useIsDarkTheme();
	const choices = useMemo(
		() =>
			agentChoices(
				agents.filter((agent) => !agent.disabled || agent.id === selectedAgent),
				isDark,
			),
		[agents, isDark, selectedAgent],
	);
	const current = agents.find((agent) => agent.id === selectedAgent);
	const preset = current ? agentLaunchPreset(current) : null;
	const configOptions = useMemo(
		() =>
			creationConfigOptions({
				models: (preset ? getAgentModelSupport(preset)?.models : null) ?? [],
				selectedModel,
				efforts,
				selectedEffort,
				labels: {
					model: t({ message: "Model" }),
					effort: t({ message: "Effort" }),
					defaultModel: t({ message: "Default model" }),
					defaultEffort: t({ message: "Default effort" }),
				},
			}),
		[preset, selectedModel, efforts, selectedEffort, t],
	);

	// The model preference is stored per agent, so a model picked from another
	// agent's tab applies once that agent is selected.
	const pendingModel = useRef<{ agentId: string; model: string } | null>(null);
	useEffect(() => {
		const pending = pendingModel.current;
		if (!pending || pending.agentId !== selectedAgent) return;
		pendingModel.current = null;
		onModelChange(pending.model);
	}, [selectedAgent, onModelChange]);

	const agentSwitcher: AgentSwitcher = {
		currentPresetId: current?.id ?? NO_AGENT,
		agents: choices,
		onSwitch: (agentId, model) => {
			pendingModel.current = model ? { agentId, model: model.id } : null;
			onSelectAgent(agentId);
		},
		onBrowse: (agentId) => {
			if (!agents.some((agent) => agent.id === agentId)) return;
			pendingModel.current = null;
			onSelectAgent(agentId);
		},
	};

	return (
		<ModelPicker
			agentSwitcher={agentSwitcher}
			configOptions={configOptions}
			emptyLabel={t({ message: "No agent" })}
			onSelect={(configId, value) => {
				if (configId === MODEL_CONFIG_ID) onModelChange(fromOptionValue(value));
				if (configId === EFFORT_CONFIG_ID)
					onEffortChange(fromOptionValue(value));
			}}
			footer={
				<div className="flex flex-col gap-px border-t p-1 empty:hidden">
					{renderAccountItem?.(MENU_ROW_CLASS, MENU_PANEL_CLASS)}
				</div>
			}
		/>
	);
}
