import { Trans, useLingui } from "@lingui/react/macro";
import { acpHarnessForPreset } from "@superset/chat/core";
import type { SessionConfigOption } from "@superset/chat/protocol";
import { resolveAgentLaunchPresetId } from "@superset/shared/agent-models";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import { useMemo, useState } from "react";
import { useIsDarkTheme } from "renderer/assets/app-icons/preset-icons";
import { ForkModelCatalogStatus } from "renderer/components/ForkModelCatalogStatus";
import { useForkCatalogAccount } from "renderer/hooks/useForkCatalogAccount";
import { useForkMenuDialog } from "renderer/hooks/useForkMenuDialog";
import { useForkModelCatalog } from "renderer/hooks/useForkModelCatalog";
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
	command?: string;
	iconId?: string | null;
}

export function ForkSessionModelPicker({
	hostUrl = null,
	workspaceId,
	configs,
	data,
	configOptions,
	onSelect,
	onRequestSwitch,
}: {
	hostUrl?: string | null;
	workspaceId?: string;
	configs: ForkSessionAgentConfig[];
	data: TerminalPaneData;
	configOptions: SessionConfigOption[];
	onSelect?: (configId: string, value: string) => void;
	onRequestSwitch: (request: ForkSwitchRequest) => void;
}) {
	const { t } = useLingui();
	const isDark = useIsDarkTheme();
	const menuDialog = useForkMenuDialog();
	const chatConfigs = useMemo(
		() =>
			configs.filter((config) =>
				acpHarnessForPreset(
					resolveAgentLaunchPresetId(config.presetId, config.command ?? ""),
				),
			),
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
	const catalogAccount = useForkCatalogAccount(
		hostUrl,
		viewedConfig?.presetId ?? null,
		browsing,
	);
	const catalog = useForkModelCatalog({
		hostUrl,
		agent: viewedConfig?.id,
		workspaceId,
		accountSelection: catalogAccount.selection,
		model: draftModel,
		enabled:
			browsing &&
			!!workspaceId &&
			catalogAccount.ready &&
			!catalogAccount.blocked,
	});
	const models = catalog.models;
	const efforts = catalog.efforts;
	const draftOptions = useMemo(
		() =>
			creationConfigOptions({
				models,
				alwaysShowModel: true,
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
				{
					...(realId
						? {
								[realId]:
									configOptions.find((o) => o.category === "model")?.options ??
									[],
							}
						: {}),
					...(shown
						? {
								[shown]: browsing
									? models
									: (configOptions.find((o) => o.category === "model")
											?.options ?? []),
							}
						: {}),
				},
			),
		[chatConfigs, isDark, realId, configOptions, shown, browsing, models],
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
		// Only Favorites lists other agents' models, outside a browsed tab.
		onSwitch: (id, model) => {
			if (id === realId) {
				browse(realId, null);
				const current = configOptions.find(
					(option) => option.category === "model",
				);
				if (model && current) onSelect?.(current.id, model.id);
			} else if (browsing) browse(id, model?.id ?? null);
			else
				menuDialog.afterClose(() =>
					onRequestSwitch({ configId: id, model, effort: null }),
				);
		},
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
			onCloseAutoFocus={menuDialog.onCloseAutoFocus}
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
					<div className="border-t">
						<ForkModelCatalogStatus
							loading={catalog.isFetching || !catalogAccount.ready}
							error={catalog.isError}
							signedOut={catalogAccount.blocked}
							refresh={() => {
								void catalog.refetch();
							}}
						/>
						<div className="flex items-center gap-2 p-1.5 pl-3">
							<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
								{summary}
							</span>
							<DropdownMenuItem
								className="shrink-0 cursor-pointer rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background focus:bg-foreground/90 focus:text-background"
								onSelect={() => {
									const request = {
										configId: viewedConfig.id,
										model: picked(models, draftModel),
										effort: picked(efforts, draftEffort),
									};
									menuDialog.afterClose(() => onRequestSwitch(request));
								}}
							>
								<Trans>Switch…</Trans>
							</DropdownMenuItem>
						</div>
					</div>
				) : undefined
			}
		/>
	);
}
