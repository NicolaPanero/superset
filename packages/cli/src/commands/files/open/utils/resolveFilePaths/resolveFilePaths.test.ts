import { describe, expect, it } from "bun:test";
import { resolveFilePaths } from "./resolveFilePaths";

describe("resolveFilePaths", () => {
	it("anchors relative paths at the cwd and keeps absolute ones", () => {
		expect(
			resolveFilePaths(
				["src/a.ts", "./b.ts", "../c.ts", "/abs/d.ts"],
				"/repo/pkg",
			),
		).toEqual([
			"/repo/pkg/src/a.ts",
			"/repo/pkg/b.ts",
			"/repo/c.ts",
			"/abs/d.ts",
		]);
	});

	it("drops repeats after resolution, keeping the first position", () => {
		expect(
			resolveFilePaths(["a.ts", "/repo/a.ts", "b.ts", "./a.ts"], "/repo"),
		).toEqual(["/repo/a.ts", "/repo/b.ts"]);
	});
});
