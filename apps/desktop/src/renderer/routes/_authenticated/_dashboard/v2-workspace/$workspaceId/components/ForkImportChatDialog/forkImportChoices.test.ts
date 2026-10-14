import { describe, expect, test } from "bun:test";
import { forkImportChoices } from "./forkImportChoices";

const options = {
	sourceAgent: "grok",
	canOpen: true,
	hasWorkspace: true,
	verified: (agent: string) =>
		["grok", "codex", "cursor-agent"].includes(agent),
};
const config = (id: string, presetId = id) => ({
	id,
	presetId,
	resumeArgs: ["--resume"],
});
describe("configured import choices", () => {
	test("preserves Settings order, identities and unavailable agents", () => {
		const configs = [
			config("second", "codex"),
			config("gemini"),
			config("first", "codex"),
			config("custom"),
			config("grok"),
		];
		const choices = forkImportChoices(configs, options);
		expect(choices.map(({ config }) => config.id)).toEqual(
			configs.map((c) => c.id),
		);
		expect(choices.map((c) => c.unavailable)).toEqual([
			null,
			"transfer",
			null,
			"chat",
			null,
		]);
	});
	test("a deleted configured agent never returns from a built-in fallback", () => {
		expect(
			forkImportChoices([config("codex")], options).map(
				(c) => c.config.presetId,
			),
		).toEqual(["codex"]);
	});
	test("offers same-agent resume without requiring a converter", () => {
		expect(
			forkImportChoices([config("gemini")], {
				...options,
				sourceAgent: "gemini",
			})[0]?.unavailable,
		).toBeNull();
	});
	test("does not offer cross-agent transfers outside a registered workspace", () => {
		expect(
			forkImportChoices([config("codex"), config("grok")], {
				...options,
				hasWorkspace: false,
			}).map((c) => c.unavailable),
		).toEqual(["folder", null]);
	});
});
