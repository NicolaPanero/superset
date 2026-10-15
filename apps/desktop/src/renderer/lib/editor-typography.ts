import { FORK_EDITOR_DEFAULTS } from "./fork-editor-appearance";

export function resolveEditorLineHeight(
	fontSize: number,
	lineHeight?: number,
): number {
	return lineHeight == null
		? Math.round(fontSize * FORK_EDITOR_DEFAULTS.lineHeight)
		: fontSize * lineHeight;
}

export function resolveFontVariantLigatures(
	ligatures?: boolean,
): "normal" | "none" {
	return (ligatures ?? FORK_EDITOR_DEFAULTS.ligatures) ? "normal" : "none";
}
