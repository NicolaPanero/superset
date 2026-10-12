import { expect, test } from "bun:test";
import { getForkAgentSnapshotCommand } from "./fork-agent-snapshot";

test("Grok API keys remain on the host instead of entering synced preset snapshots", () => {
	const command = getForkAgentSnapshotCommand({
		presetId: "grok",
		command: "/bin/grok",
		args: ["--model", "grok-4.7"],
		env: {
			XAI_API_KEY: "private-key-fixture",
			GROK_MODELS_BASE_URL: "https://api.x.ai/v1",
			SETTING: "kept",
		},
	});
	expect(command).not.toContain("private-key-fixture");
	expect(command).not.toContain("XAI_API_KEY");
	expect(command).toContain("SETTING=kept");
	expect(command).toContain("--model grok-4.7");
});
