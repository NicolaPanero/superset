// New hosts start with these agents only. The other presets stay in
// "Add agent", ready to add with their bundled settings.
const FORK_DEFAULT_AGENTS = ["claude", "codex", "cursor-agent", "grok"];

export function forkDefaultAgentPresets<T extends { presetId: string }>(
	presets: readonly T[],
): T[] {
	const chosen = FORK_DEFAULT_AGENTS.flatMap((id) =>
		presets.filter((preset) => preset.presetId === id),
	);
	return chosen.length ? chosen : [...presets];
}
