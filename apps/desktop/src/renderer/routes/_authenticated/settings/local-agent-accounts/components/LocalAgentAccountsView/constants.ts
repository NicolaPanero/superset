import type { QuotaAgent } from "renderer/routes/_authenticated/settings/usage/components/UsageView/utils/visibleQuotaAgents";
export type LocalAccountAgent = QuotaAgent | "cursor-agent";
export const AGENT_LABELS: Record<LocalAccountAgent, string> = {
	claude: "Claude Code",
	codex: "Codex",
	grok: "Grok",
	agy: "Antigravity",
	opencode: "OpenCode",
	"cursor-agent": "Cursor Agent",
};
