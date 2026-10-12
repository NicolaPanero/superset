import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

test("fork menu bar icons ship transparent normal and Retina assets", () => {
	const directory = join(import.meta.dir, "src/resources/tray");
	const original = readFileSync(join(directory, "iconTemplate.png"));
	for (const [filename, size] of [
		["forkIconTemplate.png", 22],
		["forkIconTemplate@2x.png", 44],
	] as const) {
		const png = readFileSync(join(directory, filename));
		expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
		expect(png.readUInt32BE(16)).toBe(size);
		expect(png.readUInt32BE(20)).toBe(size);
		expect(png[25]).toBe(6);
		expect(png.subarray(-8, -4).toString()).toBe("IEND");
		expect(png.equals(original)).toBe(false);
	}
});
