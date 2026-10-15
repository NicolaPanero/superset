import type { TagStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import {
	getEditorTheme,
	isForkVSCodeEditorTheme,
	type Theme,
} from "shared/themes";
import darkPlus from "shiki/themes/dark-plus.mjs";
import lightPlus from "shiki/themes/light-plus.mjs";

export function getForkShikiTheme(theme: Theme) {
	if (!isForkVSCodeEditorTheme(theme)) return null;
	return theme.type === "dark" ? darkPlus : lightPlus;
}

export function getForkEditorSyntaxStyles(theme: Theme): TagStyle[] {
	if (!isForkVSCodeEditorTheme(theme)) return [];
	const { syntax } = getEditorTheme(theme);
	return [
		{
			tag: [tags.comment, tags.lineComment, tags.blockComment],
			color: syntax.comment,
			fontStyle: "normal",
		},
		{ tag: [tags.bool, tags.null, tags.self], color: syntax.keyword },
		{
			tag: tags.controlKeyword,
			color: theme.type === "dark" ? "#c586c0" : "#af00db",
		},
		{ tag: [tags.operator, tags.punctuation], color: syntax.plainText },
	];
}
