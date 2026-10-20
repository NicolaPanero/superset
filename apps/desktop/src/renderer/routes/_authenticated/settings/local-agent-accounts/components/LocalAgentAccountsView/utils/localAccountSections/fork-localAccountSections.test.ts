import { expect, test } from "bun:test";
import { localAccountSections } from "./localAccountSections";

test("configured external agents appear before their first login in the configured order", () => {
	expect(
		localAccountSections(
			[],
			[
				{ presetId: "cursor-agent" },
				{ presetId: "opencode" },
				{ presetId: "grok" },
				{ presetId: "codex" },
				{ presetId: "claude" },
			],
		),
	).toEqual(["cursor-agent", "opencode", "grok", "codex", "claude"]);
});
test("removed external agents are hidden while existing provider accounts remain manageable", () => {
	expect(
		localAccountSections([{ agent: "grok" }], [{ presetId: "claude" }]),
	).toEqual(["claude", "codex", "grok"]);
	expect(localAccountSections([], [{ presetId: "claude" }])).not.toContain(
		"cursor-agent",
	);
});
test("multiple configurations share one provider section", () => {
	expect(
		localAccountSections(
			[{ agent: "grok" }],
			[{ presetId: "grok" }, { presetId: "grok" }, { presetId: "custom" }],
		),
	).toEqual(["grok", "claude", "codex"]);
});
