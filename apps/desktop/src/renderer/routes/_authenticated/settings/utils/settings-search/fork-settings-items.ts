import type { SettingsItem, SettingVariant } from "./settings-search";

export const FORK_SETTING_ITEM_ID = {
	LOCAL_AGENT_ACCOUNTS: "local-agent-accounts",
	EXPERIMENTAL_ACP_CHAT: "experimental-acp-chat",
} as const;

export const FORK_SETTING_ITEM_VARIANT: Record<
	(typeof FORK_SETTING_ITEM_ID)[keyof typeof FORK_SETTING_ITEM_ID],
	SettingVariant
> = {
	[FORK_SETTING_ITEM_ID.LOCAL_AGENT_ACCOUNTS]: "v2",
	[FORK_SETTING_ITEM_ID.EXPERIMENTAL_ACP_CHAT]: "v2",
};

export const FORK_SETTINGS_ITEMS: SettingsItem[] = [
	{
		id: FORK_SETTING_ITEM_ID.LOCAL_AGENT_ACCOUNTS,
		section: "localAgentAccounts",
		title: "Local agent accounts",
		description:
			"Choose local CLI accounts, rename profiles and view provider quotas",
		keywords: [
			"accounts",
			"claude",
			"codex",
			"local",
			"quota",
			"profile",
			"login",
			"rename",
			"default",
		],
	},
	{
		id: FORK_SETTING_ITEM_ID.EXPERIMENTAL_ACP_CHAT,
		section: "experimental",
		title: "ACP chat",
		description: "Open new supported agents in a shared chat interface",
		keywords: [
			"acp",
			"chat",
			"agent",
			"claude",
			"codex",
			"cursor",
			"grok",
			"opencode",
			"terminal",
			"toggle",
		],
	},
];
