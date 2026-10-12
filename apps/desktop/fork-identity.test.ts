import { afterEach, expect, test } from "bun:test";
import { forkIdentity } from "./fork-identity";

const previous = process.env.SUPERSET_WORKSPACE_NAME;
afterEach(() => {
	if (previous === undefined) delete process.env.SUPERSET_WORKSPACE_NAME;
	else process.env.SUPERSET_WORKSPACE_NAME = previous;
});
test("fork branding keeps its established data and login identity", () => {
	process.env.SUPERSET_WORKSPACE_NAME = "fork";
	expect(forkIdentity("Superset")).toEqual({
		productName: "Superset++",
		appId: "com.superset.desktop.fork",
		scheme: "superset-fork",
	});
});
test.each([
	undefined,
	"local-worktree",
])("official and development builds preserve their identities: %s", (value) => {
	if (value === undefined) delete process.env.SUPERSET_WORKSPACE_NAME;
	else process.env.SUPERSET_WORKSPACE_NAME = value;
	expect(forkIdentity("Superset")).toEqual({
		productName: "Superset",
		appId: "com.superset.desktop",
		scheme: "superset",
	});
});
