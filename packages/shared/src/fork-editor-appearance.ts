export function getForkEditorDefaults(platform: string) {
	const isMac = /mac|darwin/i.test(platform);
	const isWindows = !isMac && /win/i.test(platform);
	return {
		fontFamily: isMac
			? 'Menlo, Monaco, "Courier New", monospace'
			: isWindows
				? 'Consolas, "Courier New", monospace'
				: '"Droid Sans Mono", "JetBrains Mono", monospace',
		fontSize: 12,
		lineHeight: isMac ? 1.5 : 1.35,
		ligatures: false,
	} as const;
}
