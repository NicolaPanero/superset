import { describe, expect, test } from "bun:test";
import {
	FORK_KEEP_AWAKE_STALE_TURN_MS,
	isAnyAgentWorking,
	parseForkKeepAwakeMode,
	shouldKeepAwake,
} from "./fork-keep-awake-state";

describe("parseForkKeepAwakeMode", () => {
	test("defaults to agents when nothing is saved or the file is broken", () => {
		expect(parseForkKeepAwakeMode(null)).toBe("agents");
		expect(parseForkKeepAwakeMode("{")).toBe("agents");
		expect(parseForkKeepAwakeMode('{"mode":"forever"}')).toBe("agents");
	});

	test("reads a saved mode", () => {
		expect(parseForkKeepAwakeMode('{"mode":"off"}')).toBe("off");
		expect(parseForkKeepAwakeMode('{"mode":"always"}')).toBe("always");
	});
});

describe("isAnyAgentWorking", () => {
	const now = 10 * FORK_KEEP_AWAKE_STALE_TURN_MS;

	test("only a running turn counts as working", () => {
		expect(
			isAnyAgentWorking(
				[
					{ lastEventType: "Stop", lastEventAt: now },
					{ lastEventType: "PermissionRequest", lastEventAt: now },
					{ lastEventType: "Attached", lastEventAt: now },
				],
				now,
			),
		).toBe(false);
		expect(
			isAnyAgentWorking(
				[
					{ lastEventType: "Stop", lastEventAt: now },
					{ lastEventType: "Start", lastEventAt: now - 1000 },
				],
				now,
			),
		).toBe(true);
	});

	test("ignores a turn with no event for too long", () => {
		expect(
			isAnyAgentWorking(
				[
					{
						lastEventType: "Start",
						lastEventAt: now - FORK_KEEP_AWAKE_STALE_TURN_MS,
					},
				],
				now,
			),
		).toBe(false);
	});
});

test("shouldKeepAwake follows the mode", () => {
	expect(shouldKeepAwake("off", true)).toBe(false);
	expect(shouldKeepAwake("agents", false)).toBe(false);
	expect(shouldKeepAwake("agents", true)).toBe(true);
	expect(shouldKeepAwake("always", false)).toBe(true);
});
