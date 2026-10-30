import type { SessionConfigOption } from "@superset/chat/protocol";
import type { TerminalPaneData } from "../../../../../../types";

/**
 * The pane data that keeps a model picked in the chat. A chat that loses its
 * live session resumes from this data, so the pick must be stored here or the
 * agent starts again on its own default.
 */
export function forkChatModelPick(
	data: TerminalPaneData,
	configOptions: SessionConfigOption[],
	configId: string,
	value: string,
): TerminalPaneData | null {
	const option = configOptions.find(
		(entry) => entry.id === configId && entry.category === "model",
	);
	const choice = option?.options.find((entry) => entry.id === value);
	if (!choice) return null;
	if (data.chatModelId === choice.id && data.chatModelLabel === choice.label)
		return null;
	return { ...data, chatModelId: choice.id, chatModelLabel: choice.label };
}
