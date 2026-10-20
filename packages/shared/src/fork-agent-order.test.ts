import { expect, test } from "bun:test";
import { orderForkDefaultAgentPresets } from "./fork-agent-order";
import {
	AGENT_PRESET_FEATURE_FLAGS,
	getDefaultSeedPresets,
	HOST_AGENT_PRESETS,
} from "./host-agent-presets";

test("new hosts start with Claude, Codex, Cursor Agent, OpenCode and Amp", () => {
	const initial = getDefaultSeedPresets().map((preset) => preset.presetId);
	const priority = ["claude", "codex", "cursor-agent", "opencode", "amp"];
	const seedable = HOST_AGENT_PRESETS.filter(
		(preset) => !AGENT_PRESET_FEATURE_FLAGS.has(preset.presetId),
	);
	expect(initial.slice(0, 5)).toEqual(priority);
	expect(initial.slice(5)).toEqual(
		seedable
			.filter((preset) => !priority.includes(preset.presetId))
			.map((preset) => preset.presetId),
	);
	expect(initial).toHaveLength(seedable.length);
});

test("future agents retain their catalog order without modifying the source", () => {
	const presets = [
		{ presetId: "new-upstream-agent" },
		{ presetId: "gemini" },
		{ presetId: "amp" },
		{ presetId: "claude" },
		{ presetId: "another-new-agent" },
	];
	const original = [...presets];
	expect(
		orderForkDefaultAgentPresets(presets).map((preset) => preset.presetId),
	).toEqual([
		"claude",
		"amp",
		"new-upstream-agent",
		"gemini",
		"another-new-agent",
	]);
	expect(presets).toEqual(original);
});
