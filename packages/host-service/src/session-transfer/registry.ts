export const TRANSFER_AGENTS = {
	claude: {
		harness: "claude_code",
		profileKey: "CLAUDE_CONFIG_DIR",
		home: ".claude",
		store: "projects",
	},
	codex: {
		harness: "codex",
		profileKey: "CODEX_HOME",
		home: ".codex",
		store: "sessions",
	},
	"cursor-agent": { harness: "cursor", home: ".cursor", store: "chats" },
	grok: { harness: "grok", home: ".grok", store: "sessions" },
	opencode: {
		harness: "opencode",
		home: ".local/share/opencode",
		store: "opencode.db",
	},
} as const;

export type TransferAgent = keyof typeof TRANSFER_AGENTS;
export type VerifiedNativeAgent = TransferAgent;

export function isVerifiedNativeAgent(
	agent: string,
): agent is VerifiedNativeAgent {
	return Object.hasOwn(TRANSFER_AGENTS, agent);
}

export function pinNativeProfile(
	env: Record<string, string>,
	agent: "claude" | "codex",
	profile: string | null,
): Record<string, string> {
	const key = TRANSFER_AGENTS[agent].profileKey;
	return {
		...env,
		[key]: profile ?? "",
		[`SUPERSET_DEFAULT_${key}`]: "",
		SUPERSET_PINNED_ACCOUNT_ENV: key,
	};
}
