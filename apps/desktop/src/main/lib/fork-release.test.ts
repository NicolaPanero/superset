import { describe, expect, it } from "bun:test";
import { newerForkRelease } from "./fork-release";

describe("newerForkRelease", () => {
	it("offers only a different desktop release tag", () => {
		expect(
			newerForkRelease(
				"desktop-v1.36.0-fork.abc1234",
				"desktop-v1.37.0-fork.def5678",
			),
		).toBe("desktop-v1.37.0-fork.def5678");
		expect(
			newerForkRelease(
				"desktop-v1.36.0-fork.abc1234",
				"desktop-v1.36.0-fork.abc1234",
			),
		).toBeNull();
		expect(
			newerForkRelease("desktop-v1.36.0-fork.abc1234", "cli-v1.36.0"),
		).toBeNull();
		expect(
			newerForkRelease("desktop-v1.36.0-fork.abc1234", undefined),
		).toBeNull();
	});
});
