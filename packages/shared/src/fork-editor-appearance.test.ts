import { describe, expect, test } from "bun:test";
import { getForkEditorDefaults } from "./fork-editor-appearance";
import { darkTheme, lightTheme, monokaiTheme } from "./themes/built-in";
import { getEditorTheme } from "./themes/editor-theme";
import { isForkVSCodeEditorTheme } from "./themes/fork-vscode-editor";

describe("VS Code editor defaults", () => {
	test("uses native platform fonts at 12px without confusing Darwin with Windows", () => {
		expect(getForkEditorDefaults("MacIntel")).toMatchObject({
			fontSize: 12,
			lineHeight: 1.5,
		});
		expect(getForkEditorDefaults("darwin").fontFamily).toStartWith("Menlo");
		expect(getForkEditorDefaults("Win32")).toMatchObject({
			fontSize: 12,
			lineHeight: 1.35,
		});
		expect(getForkEditorDefaults("win32").fontFamily).toStartWith("Consolas");
		expect(getForkEditorDefaults("Linux x86_64").fontFamily).toContain(
			'"JetBrains Mono"',
		);
		expect(getForkEditorDefaults("linux").ligatures).toBe(false);
	});

	test("keeps editor palettes separate from terminal colors and honors explicit overrides", () => {
		expect(getEditorTheme(darkTheme)).toMatchObject({
			colors: { background: "#1e1e1e", selection: "#264f78" },
			syntax: { keyword: "#569cd6", comment: "#6a9955", string: "#ce9178" },
		});
		expect(getEditorTheme(lightTheme).syntax.keyword).toBe("#0000ff");
		expect(
			getEditorTheme({
				...darkTheme,
				editor: {
					colors: { background: "#123456" },
					syntax: { keyword: "#abcdef" },
				},
			}),
		).toMatchObject({
			colors: { background: "#123456" },
			syntax: { keyword: "#abcdef" },
		});
		expect(isForkVSCodeEditorTheme(monokaiTheme)).toBe(false);
		expect(isForkVSCodeEditorTheme({ ...darkTheme, isCustom: true })).toBe(
			false,
		);
	});
});
