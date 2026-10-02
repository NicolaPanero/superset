import { describe, expect, it } from "bun:test";
import { valid } from "semver";
import catalogue from "./acp-harnesses.json" with { type: "json" };

const entries = Object.entries(
	catalogue as unknown as Record<string, Record<string, unknown>>,
).filter(([key]) => !key.startsWith("$"));

describe("acp-harnesses.json", () => {
	it("describes at least the harnesses the product offers", () => {
		expect(entries.map(([id]) => id)).toContain("claude-acp");
		expect(entries.map(([id]) => id)).toContain("codex-acp");
		expect(entries.map(([id]) => id)).toContain("pi-acp");
	});

	it.each(entries)("%s names a binary and a usable floor", (_id, entry) => {
		expect(typeof entry.binary).toBe("string");
		expect(entry.binary).not.toBe("");
		expect(valid(entry.minVersion as string)).not.toBeNull();
	});

	it.each(entries)("%s tells a gated reader how to upgrade", (_id, entry) => {
		if (entry.minVersion === "0.0.0") return;
		expect(entry.upgrade).toBeTypeOf("string");
		expect(entry.upgrade).not.toBe("");
	});

	it.each(entries)("%s can reach the CLI it translates for", (_id, entry) => {
		if (entry.adapter) {
			expect(entry.executableEnv).toBeTypeOf("string");
			expect(entry.executableEnv).not.toBe("");
		} else {
			expect(entry.executableEnv).toBeUndefined();
		}
	});
});
