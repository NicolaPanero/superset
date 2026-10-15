import { expect, test } from "bun:test";
import { getForkTerminalDefaults } from "./fork-terminal-appearance";
import { darkTheme } from "./themes/built-in";
import { parseThemeConfigFile } from "./themes/import";

test("uses 12px with the native Mac font and the bundled font on Windows and Linux", () => {
	for (const platform of ["darwin", "MacIntel"]) {
		expect(getForkTerminalDefaults(platform)).toMatchObject({
			fontFamily: "SF Mono",
			fontSize: 12,
		});
	}
	for (const platform of ["win32", "Win32", "linux"]) {
		expect(getForkTerminalDefaults(platform)).toMatchObject({
			fontFamily: "JetBrains Mono",
			fontSize: 12,
		});
	}
});

test("a custom terminal palette still overrides the new dark defaults", () => {
	const result = parseThemeConfigFile(
		JSON.stringify({
			name: "Custom ANSI",
			type: "dark",
			terminal: { cyan: "#123456" },
		}),
	);
	if (!result.ok) throw new Error(result.error);
	expect(result.themes[0]?.terminal?.cyan).toBe("#123456");
	expect(darkTheme.terminal?.cyan).toBe("#11a8cd");
});
