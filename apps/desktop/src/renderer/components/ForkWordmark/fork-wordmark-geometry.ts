import { FORK_DISPLAY_NAME } from "~/fork-display-name";

const GLYPHS: Record<string, readonly string[]> = {
	P: ["111", "101", "111", "100", "100"],
	A: ["010", "101", "111", "101", "101"],
	R: ["110", "101", "110", "101", "101"],
	D: ["110", "101", "101", "101", "110"],
	E: ["111", "100", "110", "100", "111"],
	V: ["101", "101", "101", "101", "010"],
	"+": ["000", "010", "111", "010", "000"],
};

const TEXT = FORK_DISPLAY_NAME.toUpperCase();
export const FORK_WORDMARK_VIEW_BOX = `0 0 ${TEXT.length * 4 - 1} 5`;
export const FORK_WORDMARK_PATH = [...TEXT]
	.flatMap((letter, position) =>
		(GLYPHS[letter] ?? []).flatMap((row, y) =>
			[...row].flatMap((pixel, x) =>
				pixel === "1" ? [`M${position * 4 + x} ${y}h1v1h-1Z`] : [],
			),
		),
	)
	.join("");
