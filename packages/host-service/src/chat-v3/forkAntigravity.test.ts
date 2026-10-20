import { expect, test } from "bun:test";
import { acpHarnessForPreset as clientHarness } from "@superset/chat/core";
import type { HostDb } from "../db";
import { ACP_HARNESSES, acpHarnessForPreset } from "./acpCatalogue";
import { agentIdForHarness } from "./chatAgentBridge";
import { antigravityDistribution } from "./forkAntigravityRuntime";
import { forkConfiguredCli } from "./forkConfiguredCli";
import { forkLaunchChoices } from "./forkLaunchChoices";

test("Antigravity uses Google's server and OAuth, separate from the agy CLI", () => {
	expect(clientHarness("agy")).toBe("antigravity-acp");
	expect(acpHarnessForPreset("agy")).toBe("antigravity-acp");
	expect(agentIdForHarness("antigravity-acp")).toBe("agy");
	expect(ACP_HARNESSES["antigravity-acp"]?.authMethodId).toBe("oauth-personal");
	expect(ACP_HARNESSES["antigravity-acp"]?.adapter).toBeUndefined();
});
test.each([
	"darwin",
	"win32",
	"linux",
] as const)("%s native distribution is official and pinned", (platform) => {
	const distribution = antigravityDistribution(platform, "x64");
	expect(distribution.url).toStartWith(
		"https://dl.google.com/agy-extensions/releases/",
	);
	expect(distribution.url).toContain("1.3.0");
	expect(distribution.url).toEndWith("-x86_64.zip");
	expect(distribution.command).toBe(
		platform === "win32" ? "agy_acp_server.exe" : "agy_acp_server.par",
	);
	expect(distribution.args).toEqual(platform === "linux" ? ["--uid="] : []);
});
test("unknown platforms fail without inventing a download", () => {
	expect(() => antigravityDistribution("aix", "x64")).toThrow();
	expect(() => antigravityDistribution("win32", "ia32")).toThrow();
});
test("a configured Antigravity runtime keeps config identity without CLI model flags", () => {
	expect(
		forkConfiguredCli({
			presetId: "agy",
			command: "/runtime/agy_acp_server.par",
			args: ["--model", "gemini"],
		}),
	).toEqual({ command: "/runtime/agy_acp_server.par", model: undefined });
	expect(
		forkLaunchChoices(
			{} as HostDb,
			"antigravity-acp",
			{ agentConfigId: "google" },
			() => ({ id: "google", presetId: "agy" }),
		),
	).toEqual({ agentConfigId: "google", accountSelection: undefined });
});
