import type { AgentEffortSupport, AgentModelSupport } from "./agent-models";

export const FORK_AGENT_MODEL_SUPPORT: readonly AgentModelSupport[] = [
	{
		presetId: "grok",
		modelFlag: "--model",
		models: [
			{ id: "grok-4.7", label: "Grok 4.7" },
			{ id: "grok-4.6", label: "Grok 4.6" },
			{ id: "grok-4.5", label: "Grok 4.5" },
		],
	},
];

const GROK_REASONING_MODELS = ["grok-4.7", "grok-4.6", "grok-4.5"];

export const FORK_AGENT_EFFORT_SUPPORT: readonly AgentEffortSupport[] = [
	{
		presetId: "grok",
		effortFlag: "--reasoning-effort",
		efforts: [
			{ id: "low", label: "Low", models: GROK_REASONING_MODELS },
			{ id: "medium", label: "Medium", models: GROK_REASONING_MODELS },
			{ id: "high", label: "High", models: GROK_REASONING_MODELS },
			{ id: "xhigh", label: "xHigh", models: ["grok-4.7", "grok-4.6"] },
		],
	},
];
