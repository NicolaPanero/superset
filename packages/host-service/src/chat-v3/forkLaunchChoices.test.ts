import { describe, expect, it } from "bun:test";
import type { HostDb } from "../db";
import { forkLaunchChoices } from "./forkLaunchChoices";

const db = {} as HostDb;
const presets: Record<string, string> = {
	"claude-config": "claude",
	"codex-config": "codex",
};
const resolve = (_db: HostDb, id: string) =>
	presets[id] ? { presetId: presets[id] } : null;

describe("forkLaunchChoices", () => {
	it("keeps the saved config and account for the agent they belong to", () => {
		expect(
			forkLaunchChoices(
				db,
				"codex-acp",
				{ agentConfigId: "codex-config", accountSelection: "/profiles/work" },
				resolve,
			),
		).toEqual({
			agentConfigId: "codex-config",
			accountSelection: "/profiles/work",
		});
		expect(
			forkLaunchChoices(
				db,
				"claude-acp",
				{ agentConfigId: "claude-config" },
				resolve,
			),
		).toEqual({ agentConfigId: "claude-config", accountSelection: undefined });
	});

	it("drops another agent's choices left on the pane by an agent switch", () => {
		expect(
			forkLaunchChoices(
				db,
				"codex-acp",
				{ agentConfigId: "claude-config", accountSelection: null },
				resolve,
			),
		).toEqual({});
		expect(forkLaunchChoices(db, "codex-acp", {}, resolve)).toEqual({});
	});
});
