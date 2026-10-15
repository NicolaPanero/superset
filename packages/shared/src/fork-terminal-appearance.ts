export const FORK_TERMINAL_DEFAULTS = {
	fontFamily: "JetBrains Mono",
	lineHeight: 1.1,
	minimumContrast: 3,
} as const;

export function getForkTerminalDefaults(platform: string) {
	const isMac = /mac|darwin/i.test(platform);
	return {
		...FORK_TERMINAL_DEFAULTS,
		fontFamily: isMac ? "SF Mono" : FORK_TERMINAL_DEFAULTS.fontFamily,
		fontSize: isMac ? 11 : 14,
	};
}
