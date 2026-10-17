import { useSyncExternalStore } from "react";
import type { TerminalPaneData } from "../../../../../../types";

/** The chat a pane held before it switched agent or account in place. */
export interface PreviousChat {
	label: string;
	data: TerminalPaneData;
	summaryOnly: boolean;
}

const previous = new Map<string, PreviousChat>();
const listeners = new Set<() => void>();
const notify = () => {
	for (const listener of listeners) listener();
};

/** Kept in memory: going back is offered for switches made in this run. */
export function rememberPreviousChat(
	source: TerminalPaneData,
	label: string,
	summaryOnly: boolean,
): void {
	const {
		acpSessionId: _session,
		pendingPrompt: _prompt,
		pendingAttachments: _attachments,
		...data
	} = source;
	previous.set(source.terminalId, { label, data, summaryOnly });
	notify();
}

export function forgetPreviousChat(terminalId: string): void {
	if (previous.delete(terminalId)) notify();
}

export function usePreviousChat(terminalId: string): PreviousChat | undefined {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => previous.get(terminalId),
	);
}
