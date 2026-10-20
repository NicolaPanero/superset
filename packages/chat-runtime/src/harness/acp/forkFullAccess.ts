import {
	AGENT_DEFAULT_MODE,
	FULL_ACCESS_CHAT_MODE,
	isFullAccessMode,
} from "@superset/chat/protocol";

type Mode = { id: string; label: string };
export function fullAccessModes(modes: Mode[], selected: boolean): Mode[] {
	const offered = modes.filter((mode) => mode.id !== FULL_ACCESS_CHAT_MODE);
	if (offered.some((mode) => isFullAccessMode(mode.id)) && !selected)
		return offered;
	return [
		...(offered.length
			? offered.filter((mode) => !selected || !isFullAccessMode(mode.id))
			: [{ id: AGENT_DEFAULT_MODE, label: "Ask for approval" }]),
		{ id: FULL_ACCESS_CHAT_MODE, label: "Full access" },
	];
}
export function fullAccessNativeMode(
	modes: Mode[],
	current: string | undefined,
): string | undefined {
	const nativeFull = modes.find((mode) => isFullAccessMode(mode.id));
	if (nativeFull) return nativeFull.id;
	const toolMode = [
		"agent",
		"code",
		"build",
		"default",
		"autoEdit",
		"acceptEdits",
		"workspace-write",
		"auto",
	].find((id) => modes.some((mode) => mode.id === id));
	return toolMode ?? current;
}
export function fullAccessAllowOption(
	options: Array<{ optionId: string; kind?: string }>,
): string | undefined {
	return (
		options.find((option) => option.kind === "allow_once")?.optionId ??
		options.find((option) => option.kind === "allow_always")?.optionId ??
		options.find(
			(option) =>
				option.kind === undefined &&
				/^(allow[-_]once|allow|accept)$/i.test(option.optionId),
		)?.optionId
	);
}
