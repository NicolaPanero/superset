import { Trans, useLingui } from "@lingui/react/macro";
import { acpHarnessForPreset } from "@superset/chat/core";
import type { SessionConfigOption } from "@superset/chat/protocol";
import {
	getAgentEfforts,
	getAgentModelSupport,
} from "@superset/shared/agent-models";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import { useMemo, useState } from "react";
import { useIsDarkTheme } from "renderer/assets/app-icons/preset-icons";
import {
	agentChoices,
	creationConfigOptions,
	EFFORT_CONFIG_ID,
	fromOptionValue,
	MODEL_CONFIG_ID,
} from "renderer/lib/fork-model-options";
import type { TerminalPaneData } from "../../../../../../types";
import {
	type AgentSwitcher,
	ModelPicker,
} from "../../../ChatSession/components/Composer/components/ModelPicker";
import type { ForkSwitchRequest } from "../ForkChatSwitchDialog";

function picked(
	options: Array<{ id: string; label: string }>,
	id: string | null,
): { id: string; label: string } | null {
	const option = options.find((entry) => entry.id === id);
	return option ? { id: option.id, label: option.label } : null;
}

/**
 * The chat's model picker with every agent as a tab. The chat's own agent
 * applies at once; another agent's model and effort stay a draft until
 * Switch opens the confirmation, and closing the picker drops the draft.
 */
export interface ForkSessionAgentConfig {
	id: string;
	label: string;
	presetId: string;
	iconId?: string | null;
}

export function ForkSessionModelPicker({
	configs,
	data,
	configOptions,
	onSelect,
	onRequestSwitch,
}: {
	configs: ForkSessionAgentConfig[];
	data: TerminalPaneData;
	configOptions: SessionConfigOption[];
	onSelect?: (configId: string, value: string) => void;
	onRequestSwitch: (request: ForkSwitchRequest) => void;
}) {
	const { t } = useLingui();
	const isDark = useIsDarkTheme();
	const chatConfigs = useMemo(
		() => configs.filter((config) => acpHarnessForPreset(config.presetId)),
		[configs],
	);
	const realId =
		chatConfigs.find((config) => config.id === data.acpAgentConfigId)?.id ??
		chatConfigs.find((config) => config.presetId === data.agent?.id)?.id ??
		null;
	const [viewed, setViewed] = useState<string | null>(null);
	const [draftModel, setDraftModel] = useState<string | null>(null);
	const [draftEffort, setDraftEffort] = useState<string | null>(null);
	const shown = viewed ?? realId;
	const browsing = shown !== null && shown !== realId;
	const viewedConfig = chatConfigs.find((config) => config.id === shown);
	const models = useMemo(
		() =>
			(viewedConfig
				? getAgentModelSupport(viewedConfig.presetId)?.models
				: null) ?? [],
		[viewedConfig],
	);
	const efforts = useMemo(
		() =>
			viewedConfig
				? getAgentEfforts(viewedConfig.presetId, draftModel ?? undefined)
				: [],
		[viewedConfig, draftModel],
	);
	const draftOptions = useMemo(
		() =>
			creationConfigOptions({
				models,
				selectedModel: draftModel,
				efforts,
				selectedEffort: draftEffort,
				labels: {
					model: t({ message: "Model" }),
					effort: t({ message: "Effort" }),
					defaultModel: t({ message: "Default model" }),
					defaultEffort: t({ message: "Default effort" }),
				},
			}),
		[models, draftModel, efforts, draftEffort, t],
	);
	const agents = useMemo(
		() =>
			agentChoices(
				chatConfigs.map((config) => ({
					id: config.id,
					label: config.label,
					iconId: config.iconId ?? config.presetId,
					presetId: config.presetId,
				})),
				isDark,
			),
		[chatConfigs, isDark],
	);
	const browse = (id: string, model: string | null) => {
		setViewed(id === realId ? null : id);
		setDraftModel(model);
		setDraftEffort(null);
	};

	if (!realId)
		return onSelect && configOptions.length > 0 ? (
			<ModelPicker configOptions={configOptions} onSelect={onSelect} />
		) : null;

	const agentSwitcher: AgentSwitcher = {
		currentPresetId: shown ?? realId,
		agents,
		onBrowse: (id) => {
			if (chatConfigs.some((config) => config.id === id)) browse(id, null);
		},
		onSwitch: (id, model) => browse(id, model?.id ?? null),
	};
	const summary = [
		viewedConfig?.label,
		picked(models, draftModel)?.label ?? t({ message: "Default model" }),
		picked(efforts, draftEffort)?.label,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<ModelPicker
			agentSwitcher={agentSwitcher}
			configOptions={browsing ? draftOptions : configOptions}
			keepOpenOnPick={browsing}
			onOpenChange={(open) => {
				if (!open) browse(realId, null);
			}}
			onSelect={(configId, value) => {
				if (!browsing) {
					onSelect?.(configId, value);
					return;
				}
				if (configId === MODEL_CONFIG_ID) {
					setDraftModel(fromOptionValue(value));
					setDraftEffort(null);
				}
				if (configId === EFFORT_CONFIG_ID)
					setDraftEffort(fromOptionValue(value));
			}}
			footer={
				browsing && viewedConfig ? (
					<div className="flex items-center gap-2 border-t p-1.5 pl-3">
						<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
							{summary}
						</span>
						<DropdownMenuItem
							className="shrink-0 cursor-pointer rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background focus:bg-foreground/90 focus:text-background"
							onSelect={() =>
								onRequestSwitch({
									configId: viewedConfig.id,
									model: picked(models, draftModel),
									effort: picked(efforts, draftEffort),
								})
							}
						>
							<Trans>Switch…</Trans>
						</DropdownMenuItem>
					</div>
				) : undefined
			}
		/>
	);
}
