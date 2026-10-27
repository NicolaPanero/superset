import { afterEach, expect, test } from "bun:test";
import { toAppDisplayName } from "./app-display-name";

const previous = process.env.SUPERSET_WORKSPACE_NAME;
afterEach(() => {
	if (previous === undefined) delete process.env.SUPERSET_WORKSPACE_NAME;
	else process.env.SUPERSET_WORKSPACE_NAME = previous;
});

test.each([
	"Superset",
	"Paradev",
	"Paradev++",
])("the packaged fork has the same display name with override %s", (displayName) => {
	process.env.SUPERSET_WORKSPACE_NAME = "fork";
	expect(toAppDisplayName("Superset++", displayName)).toBe("Paradev++");
	expect(toAppDisplayName("Superset++ Canary", displayName)).toBe(
		"Paradev++ Canary",
	);
});

test("official builds preserve the upstream display name and suffix", () => {
	delete process.env.SUPERSET_WORKSPACE_NAME;
	expect(toAppDisplayName("Superset Canary", "Paradev")).toBe("Paradev Canary");
	expect(toAppDisplayName("Superset (branch)", "Paradev")).toBe(
		"Paradev (branch)",
	);
});
