import { expect, test } from "bun:test";
import {
	FORK_DISPLAY_NAME,
	forkAppDisplayName,
} from "../../../fork-display-name";

test.each([
	"Superset++",
	"Superset++ Canary",
	"Superset++ (worktree)",
])("the legacy technical name displays exactly one fork suffix: %s", (name) => {
	expect(forkAppDisplayName(name)).toBe(
		name.replace("Superset++", FORK_DISPLAY_NAME),
	);
});

test("a fork build resolves the product display name without depending on its shell override", () => {
	expect(forkAppDisplayName("Superset", true)).toBe("Paradev++");
	expect(forkAppDisplayName("Superset Canary", true)).toBe("Paradev++ Canary");
	expect(forkAppDisplayName("Paradev++ Canary", true)).toBe("Paradev++ Canary");
});

test("official and unrecognized app names retain their normal display resolution", () => {
	expect(forkAppDisplayName("Superset")).toBeUndefined();
	expect(forkAppDisplayName("Superset Canary")).toBeUndefined();
	expect(forkAppDisplayName("Electron", true)).toBeUndefined();
});
