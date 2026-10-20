import { expect, test } from "bun:test";
import { forkDefaultAgentPresets } from "./fork-agent-order";
import { getDefaultSeedPresets, getPresetById } from "./host-agent-presets";

test("new hosts start with Claude, Codex, Cursor Agent and Grok only", () => {
	expect(getDefaultSeedPresets().map((preset) => preset.presetId)).toEqual([
		"claude",
		"codex",
		"cursor-agent",
		"grok",
	]);
	expect(getPresetById("opencode")?.label).toBe("OpenCode");
});

test("keeps the whole catalog when none of the defaults exist", () => {
	const presets = [{ presetId: "new-upstream-agent" }, { presetId: "gemini" }];
	expect(forkDefaultAgentPresets(presets)).toEqual(presets);
});
