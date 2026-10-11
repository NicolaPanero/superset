import type { HostDb } from "../../../db";
import {
	getDefaultAccountSelections,
	setDefaultAccountSelection,
} from "./default-account";
import { isolatedAccountOptions } from "./fork-isolated-accounts";

export async function ensureIsolatedDefault(
	db: HostDb,
	agent: "claude" | "codex",
	dependencies = {
		defaults: getDefaultAccountSelections,
		options: isolatedAccountOptions,
		set: setDefaultAccountSelection,
	},
) {
	const options = await dependencies.options(agent);
	const defaults = dependencies.defaults(db);
	const selected =
		agent === "claude" ? defaults.claudeConfigDir : defaults.codexHome;
	if (selected) return selected;
	const first = options.find(
		(option) => !option.reconnect && option.credentialKind === "subscription",
	);
	if (!first) return undefined;
	dependencies.set(db, agent, first.selection);
	return first.selection;
}
