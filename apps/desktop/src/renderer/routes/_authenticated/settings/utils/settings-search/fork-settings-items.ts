import type { SettingsItem, SettingVariant } from "./settings-search";

export const FORK_SETTING_ITEM_ID = {
	FORK_HIDE_CLI: "fork-hide-cli",
	FORK_HIDE_PRO: "fork-hide-pro",
	FORK_HOME_BACKGROUND: "fork-home-background",
	FORK_CONNECTIONS: "fork-connections",
	FORK_MCP_SERVERS: "fork-mcp-servers",
	FORK_ATTACHMENT_RETENTION: "fork-attachment-retention",
	LOCAL_AGENT_ACCOUNTS: "local-agent-accounts",
	EXPERIMENTAL_ACP_CHAT: "experimental-acp-chat",
} as const;

export const FORK_SETTING_ITEM_VARIANT: Record<
	(typeof FORK_SETTING_ITEM_ID)[keyof typeof FORK_SETTING_ITEM_ID],
	SettingVariant
> = {
	[FORK_SETTING_ITEM_ID.LOCAL_AGENT_ACCOUNTS]: "v2",
	[FORK_SETTING_ITEM_ID.FORK_HIDE_CLI]: "shared",
	[FORK_SETTING_ITEM_ID.FORK_HIDE_PRO]: "shared",
	[FORK_SETTING_ITEM_ID.FORK_HOME_BACKGROUND]: "v2",
	[FORK_SETTING_ITEM_ID.FORK_CONNECTIONS]: "shared",
	[FORK_SETTING_ITEM_ID.FORK_MCP_SERVERS]: "shared",
	[FORK_SETTING_ITEM_ID.FORK_ATTACHMENT_RETENTION]: "shared",
	[FORK_SETTING_ITEM_ID.EXPERIMENTAL_ACP_CHAT]: "v2",
};

export const FORK_SETTINGS_ITEMS: SettingsItem[] = [
	{
		id: FORK_SETTING_ITEM_ID.FORK_ATTACHMENT_RETENTION,
		section: "fork",
		title: "Delete old attachments",
		description:
			"Delete pasted images and files from workspaces after a number of days.",
		keywords: [
			"attachments",
			"images",
			"screenshots",
			"paste",
			"files",
			"storage",
			"disk",
			"cleanup",
			"retention",
		],
	},
	{
		id: FORK_SETTING_ITEM_ID.FORK_MCP_SERVERS,
		section: "fork",
		title: "MCP servers",
		description: "Shared by every agent and account on this computer.",
		keywords: ["mcp", "server", "tools", "claude", "codex", "agents"],
	},
	{
		id: FORK_SETTING_ITEM_ID.FORK_CONNECTIONS,
		section: "fork",
		title: "Connections",
		description: "GitHub, Bitbucket and Jira",
		keywords: [
			"github",
			"bitbucket",
			"jira",
			"oauth",
			"token",
			"account",
			"connections",
		],
	},
	{
		id: FORK_SETTING_ITEM_ID.FORK_HOME_BACKGROUND,
		section: "fork",
		title: "Interactive home background",
		description:
			"Show a character-based Superset logo and waves that respond to clicks.",
		keywords: [
			"fork",
			"home",
			"background",
			"logo",
			"characters",
			"ascii",
			"waves",
			"animation",
		],
	},
	{
		id: FORK_SETTING_ITEM_ID.FORK_HIDE_CLI,
		section: "fork",
		title: "Hide CLI options",
		description:
			"Hide CLI login accounts and the CHAT/CLI switch. Run workspace setup in the background.",
		keywords: ["fork", "cli", "terminal", "chat", "setup", "background"],
	},
	{
		id: FORK_SETTING_ITEM_ID.FORK_HIDE_PRO,
		section: "fork",
		title: "Hide Pro features",
		description: "Hide paid features and upgrade prompts on this device.",
		keywords: [
			"fork",
			"pro",
			"paid",
			"billing",
			"upgrade",
			"tasks",
			"automations",
		],
	},
	{
		id: FORK_SETTING_ITEM_ID.LOCAL_AGENT_ACCOUNTS,
		section: "localAgentAccounts",
		title: "Local agent accounts",
		description:
			"Manage local agent logins, API keys, profiles and provider quotas",
		keywords: [
			"accounts",
			"claude",
			"codex",
			"local",
			"quota",
			"cursor",
			"grok",
			"opencode",
			"api key",
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
