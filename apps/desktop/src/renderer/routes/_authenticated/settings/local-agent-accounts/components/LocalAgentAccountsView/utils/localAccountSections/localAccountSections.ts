import type { HostAgentConfig } from "@superset/host-service/settings";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import { visibleQuotaAgents } from "renderer/routes/_authenticated/settings/usage/components/UsageView/utils/visibleQuotaAgents";
import type { LocalAccountAgent } from "../../constants";
export function localAccountSections(
	accounts: Pick<UsageAccount, "agent">[],
	configs: Pick<HostAgentConfig, "presetId">[],
): LocalAccountAgent[] {
	const sections = new Set<LocalAccountAgent>(visibleQuotaAgents(accounts));
	for (const config of configs)
		if (
			config.presetId === "grok" ||
			config.presetId === "cursor-agent" ||
			config.presetId === "opencode"
		)
			sections.add(config.presetId);
	const rank = (agent: string) => {
		const index = configs.findIndex((config) => config.presetId === agent);
		return index < 0 ? configs.length : index;
	};
	return [...sections].sort((a, b) => rank(a) - rank(b));
}
