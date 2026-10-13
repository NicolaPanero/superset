import { expect, test } from "bun:test";
import { forkToolPath } from "./fork-tool-path";

test.each([
	"txcript-transfer",
	"txcript-cli",
] as const)("Windows loads bundled %s.exe from its own app directory", (tool) => {
	const expected = `C:\\Users\\Sample User\\Apps\\Superset++\\resources\\resources\\bin\\${tool}.exe`;
	expect(
		forkToolPath(
			tool,
			"C:\\Users\\Sample User\\Apps\\Superset++\\Superset++.exe",
			(path) => path === expected,
			"win32",
		),
	).toBe(expected);
});
test("the existing macOS bundle path is retained", () => {
	const expected =
		"/Applications/Superset++.app/Contents/Resources/resources/bin/txcript-transfer";
	expect(
		forkToolPath(
			"txcript-transfer",
			"/Applications/Superset++.app/Contents/MacOS/Superset++",
			(path) => path === expected,
			"darwin",
		),
	).toBe(expected);
});
