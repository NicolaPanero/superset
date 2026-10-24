import { useForkCreationAccount } from "renderer/components/ForkAccountPicker";
import { useAgentEffortPreference } from "renderer/hooks/useAgentEffortPreference";
import { useAgentModelPreference } from "renderer/hooks/useAgentModelPreference";
import { useForkModelCatalog } from "renderer/hooks/useForkModelCatalog";
import {
	EFFORT_STORAGE_KEY,
	MODEL_STORAGE_KEY,
} from "../../../DashboardNewWorkspaceForm/PromptGroup/types";

export function useForkCreationSelections(input: {
	hostUrl: string | null;
	agent: string;
	presetId: string | null;
	projectId: string | null;
	resetKey: number;
	enabled: boolean;
}) {
	const preference = useAgentModelPreference(
		MODEL_STORAGE_KEY,
		input.presetId,
		true,
	);
	const effort = useAgentEffortPreference(
		EFFORT_STORAGE_KEY,
		input.presetId,
		true,
	);
	const forkAccount = useForkCreationAccount(
		input.hostUrl,
		input.agent,
		input.presetId,
		preference.selectedModel,
		input.resetKey,
	);
	const catalog = useForkModelCatalog({
		hostUrl: input.hostUrl,
		agent: input.agent,
		accountSelection: forkAccount.selection,
		projectId: input.projectId ?? undefined,
		model: preference.selectedModel,
		enabled:
			input.enabled &&
			((input.presetId !== "claude" && input.presetId !== "codex") ||
				forkAccount.available),
	});
	const selectedModel = catalog.models.some(
		(o) => o.id === preference.selectedModel,
	)
		? preference.selectedModel
		: null;
	const effortForLaunch = catalog.efforts.some(
		(o) => o.id === effort.selectedEffort,
	)
		? effort.selectedEffort
		: null;
	return {
		...preference,
		selectedModel,
		...effort,
		effortForLaunch,
		forkAccount,
		catalog,
		modelSupport: { models: catalog.models },
		effortSupport: true,
		effortOptions: catalog.efforts,
	};
}
