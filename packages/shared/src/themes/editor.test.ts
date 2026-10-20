import { describe, expect, it } from "bun:test";
import { darkTheme, lightTheme } from "./built-in";
import { getEditorTheme } from "./editor-theme";

describe("getEditorTheme", () => {
	it("derives editor colors from dark theme tokens without explicit overrides", () => {
		const theme = { ...darkTheme, editor: undefined };
		const editorTheme = getEditorTheme(theme);
		expect(editorTheme.colors.background).toBe(theme.ui.background);
		expect(editorTheme.colors.foreground).toBe(theme.ui.foreground);
		expect(editorTheme.colors.search).toBe(theme.ui.highlightMatch);
		expect(editorTheme.colors.addition).toBe(theme.terminal?.brightGreen ?? "");
		expect(editorTheme.colors.deletion).toBe(theme.terminal?.brightRed ?? "");
		expect(editorTheme.syntax.keyword).toBe(theme.terminal?.magenta ?? "");
	});

	it("returns explicit editor overrides when present", () => {
		const baseEditorTheme = getEditorTheme(lightTheme);
		const editorTheme = getEditorTheme({
			...lightTheme,
			editor: {
				colors: {
					...baseEditorTheme.colors,
					background: "#f5f0e8",
				},
				syntax: {
					...baseEditorTheme.syntax,
					string: "#00875a",
				},
			},
		});

		expect(editorTheme.colors.background).toBe("#f5f0e8");
		expect(editorTheme.syntax.string).toBe("#00875a");
		expect(editorTheme.colors.searchActive).toBe(
			baseEditorTheme.colors.searchActive,
		);
	});

	it("prefers ui colors when terminal colors are not provided", () => {
		const editorTheme = getEditorTheme({
			...darkTheme,
			terminal: undefined,
			editor: undefined,
			ui: {
				...darkTheme.ui,
				background: "#101820",
				foreground: "#f4efe6",
				card: "#18232d",
				border: "#355066",
				mutedForeground: "#8ea3b7",
				primary: "#e39b57",
				secondary: "#21303d",
				secondaryForeground: "#f4efe6",
				accent: "#25465f",
				destructive: "#ff6b6b",
				chart1: "#ff8f6b",
				chart2: "#4dd4ac",
				chart3: "#6bbcff",
				chart4: "#ffd166",
				chart5: "#c792ea",
				highlightMatch: "rgba(255, 209, 102, 0.28)",
				highlightActive: "rgba(107, 188, 255, 0.36)",
			},
		});

		expect(editorTheme.colors.background).toBe("#101820");
		expect(editorTheme.colors.foreground).toBe("#f4efe6");
		expect(editorTheme.colors.panel).toBe("#18232d");
		expect(editorTheme.colors.addition).toBe("#4dd4ac");
		expect(editorTheme.colors.deletion).toBe("#ff6b6b");
		expect(editorTheme.colors.modified).toBe("#6bbcff");
		expect(editorTheme.syntax.keyword).toBe("#e39b57");
		expect(editorTheme.syntax.comment).toBe("#8ea3b7");
		expect(editorTheme.syntax.string).toBe("#4dd4ac");
	});
});
