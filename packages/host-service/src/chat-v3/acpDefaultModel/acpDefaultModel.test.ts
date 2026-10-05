import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	acpDefaultModel,
	grokDefaultModel,
	opencodeRecentModel,
} from "./acpDefaultModel";

describe("ACP default model", () => {
	it("reads only the default of the Grok models table", () => {
		expect(
			grokDefaultModel(
				'[ui]\ndefault = "other"\n[models]\ndefault = "grok-4.7"\n[model."grok-4.7"]\nmodel = "grok-4.7"\n',
			),
		).toBe("grok-4.7");
		expect(grokDefaultModel('[ui]\ndefault = "grok-4.6"\n')).toBeNull();
	});
	it("uses the most recent OpenCode model as provider/model", () => {
		expect(
			opencodeRecentModel(
				JSON.stringify({
					recent: [
						{ providerID: "xai", modelID: "grok-4.7" },
						{ providerID: "opencode", modelID: "big-pickle" },
					],
				}),
			),
		).toBe("xai/grok-4.7");
		expect(opencodeRecentModel(JSON.stringify({ recent: [] }))).toBeNull();
	});
	it("returns null for other agents and for missing or unreadable files", async () => {
		const home = await mkdtemp(join(tmpdir(), "superset-acp-model-"));
		try {
			expect(await acpDefaultModel("grok", home)).toBeNull();
			await mkdir(join(home, ".local", "state", "opencode"), {
				recursive: true,
			});
			await writeFile(
				join(home, ".local", "state", "opencode", "model.json"),
				"not json",
			);
			expect(await acpDefaultModel("opencode", home)).toBeNull();
			expect(await acpDefaultModel("claude", home)).toBeNull();
		} finally {
			await rm(home, { recursive: true, force: true });
		}
	});
});
