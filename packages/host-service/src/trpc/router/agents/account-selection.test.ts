import { describe, expect, test } from "bun:test";
import type { ResolvedHostAgentConfig } from "../../../terminal-agents/agent-config";
import { selectedAccountEnv } from "./account-selection";

const config: ResolvedHostAgentConfig = {
	id: "test",
	presetId: "claude",
	label: "Claude",
	command: "claude",
	args: [],
	promptTransport: "argv",
	promptArgs: [],
	resumeArgs: [],
	forkArgs: [],
	env: {},
};
const dependencies = {
	options: async () => [
		{ selection: null, label: "Default" },
		{ selection: "/profiles/work", label: "Work" },
	],
	codexHomes: async () => [
		{
			home: "/ambient/codex",
			sourceLabel: "Default",
			credentialKind: "subscription" as const,
			loginFingerprint: null,
		},
	],
	canonical: async (path: string) => path,
	ambientEnv: {},
};

describe("per-session account selection", () => {
	test("pins a discovered profile without modifying the supplied default environment", async () => {
		const env = {
			CLAUDE_CONFIG_DIR: "/profiles/personal",
			SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: "/profiles/personal",
		};
		const selected = await selectedAccountEnv(
			config,
			env,
			"/profiles/work",
			dependencies,
		);
		expect(selected.CLAUDE_CONFIG_DIR).toBe("/profiles/work");
		expect(selected.SUPERSET_PINNED_ACCOUNT_ENV).toBe("CLAUDE_CONFIG_DIR");
		expect(selected.SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR).toBe("");
		expect(env.CLAUDE_CONFIG_DIR).toBe("/profiles/personal");
	});
	test("Claude's implicit default stays implicit for Keychain login", async () => {
		const selected = await selectedAccountEnv(
			config,
			{ CLAUDE_CONFIG_DIR: "/profiles/work" },
			null,
			dependencies,
		);
		expect(selected.CLAUDE_CONFIG_DIR).toBe("");
	});
	test("Codex's default honors the discovered ambient home", async () => {
		const selected = await selectedAccountEnv(
			{ ...config, presetId: "codex" },
			{},
			null,
			dependencies,
		);
		expect(selected.CODEX_HOME).toBe("/ambient/codex");
	});
	test("rejects arbitrary directories and unsupported peer profiles", async () => {
		await expect(
			selectedAccountEnv(config, {}, "/anywhere/auth", dependencies),
		).rejects.toThrow("account_selection_unavailable");
		await expect(
			selectedAccountEnv(
				{ ...config, presetId: "cursor-agent" },
				{},
				null,
				dependencies,
			),
		).rejects.toThrow("account_selection_unavailable");
	});
	test("rejects credentials that would silently override the chosen profile", async () => {
		await expect(
			selectedAccountEnv(
				config,
				{ ANTHROPIC_API_KEY: "test-placeholder" },
				"/profiles/work",
				dependencies,
			),
		).rejects.toThrow("account_environment_override");
		await expect(
			selectedAccountEnv({ ...config, presetId: "codex" }, {}, null, {
				...dependencies,
				ambientEnv: { OPENAI_API_KEY: "test-placeholder" },
			}),
		).rejects.toThrow("account_environment_override");
	});
});
