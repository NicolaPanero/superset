// Initial order only. Existing hosts keep their persisted, user-defined order.
// Other and future upstream agents retain their relative catalog order.
const PRIORITY = new Map(
	["claude", "codex", "cursor-agent", "opencode", "amp"].map((id, index) => [
		id,
		index,
	]),
);

export function orderForkDefaultAgentPresets<T extends { presetId: string }>(
	presets: readonly T[],
): T[] {
	return [...presets].sort(
		(a, b) =>
			(PRIORITY.get(a.presetId) ?? PRIORITY.size) -
			(PRIORITY.get(b.presetId) ?? PRIORITY.size),
	);
}
