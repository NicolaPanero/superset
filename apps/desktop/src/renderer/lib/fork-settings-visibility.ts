const PRO_ROUTES = [
	"/tasks",
	"/automations",
	"/cloud-workspaces",
	"/settings/billing",
	"/settings/mobile",
	"/settings/security",
	"/settings/teams",
	"/settings/organization",
	"/settings/environments",
	"/settings/agent-accounts",
	"/settings/connections",
] as const;

export function isForkProRoute(pathname: string): boolean {
	return PRO_ROUTES.some(
		(path) => pathname === path || pathname.startsWith(`${path}/`),
	);
}

export function isForkSetupTerminal(terminal: {
	label?: string;
	customTitle?: string | null;
}): boolean {
	return (terminal.customTitle ?? terminal.label) === "Workspace Setup";
}

const PRO_SETTING_ITEMS = new Set([
	"integrations-linear",
	"integrations-github",
	"host-members",
	"host-invite-member",
	"host-member-role",
]);

export function isForkProSetting(item: {
	section: string;
	id: string;
}): boolean {
	const path = `/settings/${item.section === "agentAccounts" ? "agent-accounts" : item.section}`;
	return isForkProRoute(path) || PRO_SETTING_ITEMS.has(item.id);
}
