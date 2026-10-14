import { expect, test } from "bun:test";
import {
	acpHarnessForPreset,
	presetForAcpHarness,
	presetForAnyHarness,
} from "@superset/chat/core";
import type {
	HarnessAdapter,
	HarnessFactoryOptions,
} from "@superset/chat-runtime";
import {
	buildAgentModelArgs,
	getAgentEfforts,
} from "@superset/shared/agent-models";
import type { HostDb } from "../db";
import { isVerifiedNativeAgent } from "../session-transfer/registry";
import { agentAccountOptions } from "../trpc/router/agents/account-selection";
import {
	ACP_HARNESSES,
	acpHarnessForPreset as hostHarness,
} from "./acpCatalogue";
import { chatSessionAccount } from "./forkChatAccount";
import { forkConfiguredCli } from "./forkConfiguredCli";
import { forkLaunchChoices } from "./forkLaunchChoices";
import { forkQuotaRecoveryHarness } from "./forkQuotaRecoveryHarness";

test("Gemini opens as a chat in the UI and the host agrees", () => {
	expect(acpHarnessForPreset("gemini")).toBe("gemini-acp");
	expect(hostHarness("gemini")).toBe("gemini-acp");
});
test("a saved Gemini ACP chat keeps its agent label on reopen", () => {
	expect(presetForAcpHarness("gemini-acp")).toBe("gemini");
	expect(presetForAnyHarness("gemini-acp")).toBe("gemini");
});
test("Gemini uses its native ACP entry without a Claude or Codex translator", () => {
	const entry = ACP_HARNESSES["gemini-acp"];
	if (!entry) throw new Error("missing Gemini harness");
	expect(entry.binary).toBe("gemini");
	expect(entry.args).toEqual(["--acp"]);
	expect(entry.adapter).toBeUndefined();
	expect(entry.authMethodId).toBe("oauth-personal");
});
test("Gemini custom executable and model reach the ACP launch", () => {
	expect(
		forkConfiguredCli({
			presetId: "gemini",
			command: "/opt/friends/gemini",
			args: ["--model", "test-gemini-model"],
		}),
	).toEqual({ command: "/opt/friends/gemini", model: "test-gemini-model" });
});
test("Gemini model equals syntax is preserved too", () => {
	expect(
		forkConfiguredCli({
			presetId: "gemini",
			command: "gemini",
			args: ["--model=test-gemini-model"],
		}),
	).toEqual({ command: undefined, model: "test-gemini-model" });
});
const db = {} as HostDb;
const presets: Record<string, string> = {
	"gemini-config": "gemini",
	"claude-config": "claude",
	"codex-config": "codex",
};
const resolve = (_db: HostDb, id: string) => {
	const preset = presets[id];
	return preset ? { presetId: preset } : null;
};
test("Gemini retains the configured agent when reopening the current pane", () => {
	expect(
		forkLaunchChoices(
			db,
			"gemini-acp",
			{ agentConfigId: "gemini-config" },
			resolve,
		),
	).toEqual({ agentConfigId: "gemini-config", accountSelection: undefined });
});
test.each([
	"claude-config",
	"codex-config",
])("Gemini does not reuse the profile left by %s", (agentConfigId) => {
	expect(
		forkLaunchChoices(
			db,
			"gemini-acp",
			{ agentConfigId, accountSelection: "/profiles/another-provider" },
			resolve,
		),
	).toEqual({});
});
test("removed Gemini config produces an actionable error", () => {
	expect(() =>
		forkLaunchChoices(db, "gemini-acp", { agentConfigId: "removed" }, resolve),
	).toThrow("agent_config_unavailable");
});
test("Gemini model flags do not acquire Claude effort flags", () => {
	expect(buildAgentModelArgs("gemini", "gemini-2.5-flash")).toEqual([
		"--model",
		"gemini-2.5-flash",
	]);
	expect(getAgentEfforts("gemini")).toEqual([]);
});
test("Gemini receives its worker directly without a Claude quota controller", () => {
	const worker = {} as HarnessAdapter;
	const selections: Array<string | null | undefined> = [];
	const options = {
		scopeId: "test-workspace",
		sessionId: "test-session",
		terminalId: "test-pane",
		cwd: "/test-worktree",
	} as HarnessFactoryOptions;
	expect(
		forkQuotaRecoveryHarness(db, "gemini-acp", options, (selection) => {
			selections.push(selection);
			return worker;
		}),
	).toBe(worker);
	expect(selections).toEqual([undefined]);
});
test("Gemini does not offer another provider's account login", async () => {
	const neverRead = async () => {
		throw new Error("must not read real profiles");
	};
	expect(
		await agentAccountOptions("gemini", {
			claudeProfiles: neverRead,
			codexHomes: neverRead,
		}),
	).toEqual([]);
	expect(
		await chatSessionAccount("gemini", {
			CLAUDE_CONFIG_DIR: "/unused",
			CODEX_HOME: "/unused",
		}),
	).toBeUndefined();
});
test("Gemini native import is not advertised before its codec is verified", () => {
	expect(isVerifiedNativeAgent("gemini")).toBe(false);
	for (const agent of ["claude", "codex", "cursor-agent", "grok", "opencode"])
		expect(isVerifiedNativeAgent(agent)).toBe(true);
});
