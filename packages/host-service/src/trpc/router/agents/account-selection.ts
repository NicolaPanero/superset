import { realpath } from "node:fs/promises";
import { basename } from "node:path";
import { TRPCError } from "@trpc/server";
import { pinNativeProfile } from "../../../session-transfer/registry";
import { getTerminalBaseEnv } from "../../../terminal/env";
import type { ResolvedHostAgentConfig } from "../../../terminal-agents/agent-config";
import { readDefaultLoginEmail } from "../usage/claude";
import { discoverClaudeProfiles, discoverCodexHomes } from "../usage/profiles";

export async function agentAccountOptions(agent: string) {
	if (agent === "claude") {
		const [profiles, email] = await Promise.all([
			discoverClaudeProfiles(),
			readDefaultLoginEmail(),
		]);
		return [
			{ selection: null, label: email ?? "System default" },
			...profiles.map((profile) => ({
				selection: profile.configDir,
				label: profile.email ?? basename(profile.configDir),
			})),
		];
	}
	if (agent === "codex") {
		const homes = await discoverCodexHomes();
		return [
			{ selection: null, label: "System default" },
			...homes.slice(1).map((home) => ({
				selection: home.home,
				label: basename(home.home),
			})),
		];
	}
	return [];
}

/** Select one discovered login for this launch, leaving the host default intact. */
export async function selectedAccountEnv(
	config: ResolvedHostAgentConfig,
	env: Record<string, string>,
	selection: string | null,
	dependencies = {
		options: agentAccountOptions,
		codexHomes: discoverCodexHomes,
		canonical: (path: string) => realpath(path),
		// The application .env contains server API settings that do not reach
		// native terminals. Validate against the actual preserved shell snapshot.
		ambientEnv: getTerminalBaseEnv(),
	},
) {
	const agent = config.presetId;
	if (agent !== "claude" && agent !== "codex")
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "account_selection_unavailable",
		});
	// A config that injects credentials would override a chosen subscription.
	const keys =
		agent === "claude"
			? ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"]
			: ["OPENAI_API_KEY", "CODEX_API_KEY"];
	if (keys.some((key) => env[key] || dependencies.ambientEnv[key]))
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "account_environment_override",
		});
	const options = await dependencies.options(agent);
	if (!options.some((option) => option.selection === selection))
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "account_selection_unavailable",
		});
	// Codex's system default can be an ambient CODEX_HOME, not ~/.codex.
	const profile =
		selection ??
		(agent === "codex" ? (await dependencies.codexHomes())[0]?.home : null);
	if (agent === "codex" && !profile)
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "account_selection_unavailable",
		});
	return pinNativeProfile(
		env,
		agent,
		profile ? await dependencies.canonical(profile) : null,
	);
}
