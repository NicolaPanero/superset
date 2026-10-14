import { acpHarnessForPreset } from "@superset/chat/core";

type Config = { id: string; presetId: string; resumeArgs?: string[] | null };

export function forkImportChoices<T extends Config>(
	configs: T[],
	options: {
		sourceAgent: string;
		canOpen: boolean;
		hasWorkspace: boolean;
		verified: (agent: string) => boolean;
	},
) {
	return configs.map((config) => {
		const sameAgent = config.presetId === options.sourceAgent;
		const unavailable = !acpHarnessForPreset(config.presetId)
			? "chat"
			: sameAgent
				? options.canOpen
					? null
					: "folder"
				: !options.hasWorkspace
					? "folder"
					: !config.resumeArgs?.length ||
							!options.verified(config.presetId) ||
							!options.verified(options.sourceAgent)
						? "transfer"
						: null;
		return { config, unavailable };
	});
}
