import { homedir } from "node:os";
import { basename } from "node:path";
import { userError } from "@superset/trpc/i18n-error";
import { isPendingAccountSelection } from "./fork-account-naming";
import {
	type ForkAccountRegistry,
	forkAccountRegistry,
	type IsolatedAccount,
} from "./fork-account-registry";
import { independentProfile } from "./fork-profile-directory";

export { independentProfile } from "./fork-profile-directory";

import { getQuota } from "./fork-quota-cache";
import { discoverClaudeProfiles, discoverCodexHomes } from "./profiles";
import { readAccountIdentity } from "./session-account/session-account";
import type { UsageAccount } from "./types";

export interface IsolatedAccountOption {
	selection: string;
	label: string;
	managed: true;
	reconnect: boolean;
	credentialKind: IsolatedAccount["credentialKind"];
}

async function discovered(agent: IsolatedAccount["agent"]) {
	return agent === "claude"
		? (await discoverClaudeProfiles()).map((profile) => ({
				selection: profile.configDir,
				credentialKind: profile.credentialKind,
			}))
		: (await discoverCodexHomes()).slice(1).map((profile) => ({
				selection: profile.home,
				credentialKind: profile.credentialKind,
			}));
}

export async function isolatedAccountOptions(
	agent: IsolatedAccount["agent"],
	dependencies = {
		registry: forkAccountRegistry(),
		discovered,
		identity: readAccountIdentity,
		independent: independentProfile,
	},
): Promise<IsolatedAccountOption[]> {
	const profiles = await dependencies.discovered(agent);
	for (const profile of profiles.slice(0, 128)) {
		if (
			isPendingAccountSelection(profile.selection) ||
			!(await dependencies.independent(agent, profile.selection))
		)
			continue;
		const identity =
			profile.credentialKind === "subscription"
				? await dependencies.identity(agent, profile.selection)
				: null;
		if (profile.credentialKind === "subscription" && !identity) continue;
		dependencies.registry.remember({
			agent,
			...profile,
			identity: identity?.identity ?? null,
			email: identity?.email ?? null,
		});
	}
	return Promise.all(
		dependencies.registry
			.list()
			.filter((row) => row.agent === agent)
			.map(async (saved) => {
				const current = profiles.find(
					(profile) => profile.selection === saved.selection,
				);
				const identity =
					saved.credentialKind === "subscription"
						? await dependencies.identity(agent, saved.selection)
						: null;
				const matches =
					current?.credentialKind === saved.credentialKind &&
					(await dependencies.independent(agent, saved.selection)) &&
					(saved.credentialKind === "api_key" ||
						identity?.identity === saved.identity);
				return {
					selection: saved.selection,
					label: saved.email ?? basename(saved.selection),
					managed: true as const,
					reconnect: !matches,
					credentialKind: saved.credentialKind,
				};
			}),
	);
}

export async function assertIsolatedAccount(
	agent: IsolatedAccount["agent"],
	selection: string,
	dependencies = { options: isolatedAccountOptions, quota: getQuota },
) {
	const option = (await dependencies.options(agent)).find(
		(row) => row.selection === selection,
	);
	if (!option || option.reconnect)
		throw userError({
			code: "PRECONDITION_FAILED",
			message: "Reconnect account",
			i18nKey: "serverError.forkAccounts.reconnect",
		});
	const account = (await dependencies.quota(false)).find(
		(row) =>
			row.agent === agent &&
			row.selection === selection &&
			row.credentialKind === option.credentialKind,
	);
	if (
		!account ||
		account.status === "signed_out" ||
		account.status === "token_expired"
	)
		throw userError({
			code: "PRECONDITION_FAILED",
			message: "Reconnect account",
			i18nKey: "serverError.forkAccounts.reconnect",
		});
}

export async function isolatedAccountQuota(
	accounts: UsageAccount[],
	registry: ForkAccountRegistry = forkAccountRegistry(),
) {
	const options = {
		claude: await isolatedAccountOptions("claude", {
			registry,
			discovered,
			identity: readAccountIdentity,
			independent: independentProfile,
		}),
		codex: await isolatedAccountOptions("codex", {
			registry,
			discovered,
			identity: readAccountIdentity,
			independent: independentProfile,
		}),
	};
	return projectIsolatedQuota(accounts, registry.list(), options);
}

export function projectIsolatedQuota(
	accounts: UsageAccount[],
	saved: IsolatedAccount[],
	options: Record<IsolatedAccount["agent"], IsolatedAccountOption[]>,
	now = Date.now(),
) {
	const result = accounts.filter(
		(account) =>
			account.selection === null ||
			(account.agent !== "claude" && account.agent !== "codex"),
	);
	for (const profile of saved) {
		const option = options[profile.agent].find(
			(row) => row.selection === profile.selection,
		);
		const current = accounts.find(
			(account) =>
				account.agent === profile.agent &&
				account.selection === profile.selection &&
				account.credentialKind === profile.credentialKind,
		);
		if (
			current &&
			option &&
			!option.reconnect &&
			(profile.credentialKind === "api_key" ||
				!current.email ||
				current.email === profile.email)
		) {
			result.push({ ...current, email: profile.email ?? current.email });
			continue;
		}
		result.push({
			agent: profile.agent,
			selection: profile.selection,
			credentialKind: profile.credentialKind,
			accountKey: `isolated:${profile.agent}:${profile.selection}`,
			sourceLabel: profile.selection.replace(homedir(), "~"),
			email: profile.email,
			plan: null,
			status: "signed_out",
			statusDetail: null,
			windows: [],
			creditsBalance: null,
			extraUsage: null,
			isDefault: false,
			fetchedAt: new Date(now),
		});
	}
	return result;
}
