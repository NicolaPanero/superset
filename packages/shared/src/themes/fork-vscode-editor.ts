import type { EditorThemeOverrides, Theme } from "./types";

export function isForkVSCodeEditorTheme(theme: Theme): boolean {
	return (
		theme.isBuiltIn === true &&
		!theme.isCustom &&
		["dark", "light"].includes(theme.id)
	);
}

export const FORK_VSCODE_DARK_EDITOR: EditorThemeOverrides = {
	colors: {
		background: "#1e1e1e",
		foreground: "#d4d4d4",
		border: "#303031",
		cursor: "#aeafad",
		gutterBackground: "#1e1e1e",
		gutterForeground: "#858585",
		activeLine: "#ffffff0a",
		selection: "#264f78",
		search: "#515c6a",
		searchActive: "#613315",
		panel: "#252526",
		panelBorder: "#454545",
		panelInputBackground: "#3c3c3c",
		panelInputForeground: "#cccccc",
		panelInputBorder: "#3c3c3c",
		panelButtonBackground: "#0e639c",
		panelButtonForeground: "#ffffff",
		panelButtonBorder: "#0e639c",
	},
	syntax: {
		plainText: "#d4d4d4",
		comment: "#6a9955",
		keyword: "#569cd6",
		string: "#ce9178",
		number: "#b5cea8",
		functionCall: "#dcdcaa",
		variableName: "#9cdcfe",
		typeName: "#4ec9b0",
		className: "#4ec9b0",
		constant: "#4fc1ff",
		regexp: "#d16969",
		tagName: "#569cd6",
		attributeName: "#9cdcfe",
		invalid: "#f44747",
	},
};

export const FORK_VSCODE_LIGHT_EDITOR: EditorThemeOverrides = {
	colors: {
		background: "#ffffff",
		foreground: "#000000",
		border: "#d4d4d4",
		cursor: "#000000",
		gutterBackground: "#ffffff",
		gutterForeground: "#237893",
		activeLine: "#0000000a",
		selection: "#add6ff",
		search: "#ea5c0055",
		searchActive: "#a8ac94",
		panel: "#f3f3f3",
		panelBorder: "#d4d4d4",
		panelInputBackground: "#ffffff",
		panelInputForeground: "#616161",
		panelInputBorder: "#cecece",
		panelButtonBackground: "#007acc",
		panelButtonForeground: "#ffffff",
		panelButtonBorder: "#007acc",
	},
	syntax: {
		plainText: "#000000",
		comment: "#008000",
		keyword: "#0000ff",
		string: "#a31515",
		number: "#098658",
		functionCall: "#795e26",
		variableName: "#001080",
		typeName: "#267f99",
		className: "#267f99",
		constant: "#0070c1",
		regexp: "#811f3f",
		tagName: "#800000",
		attributeName: "#e50000",
		invalid: "#cd3131",
	},
};
