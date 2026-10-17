/** The agent and login a handed-over chat continued from. */
export interface ForkChatOriginInfo {
	label: string;
	email: string | null;
	/** Only the messages came over, not the native session. */
	summaryOnly?: boolean;
	/** Reopens the chat this pane held before an in-place switch. */
	onReturn?: () => void;
}
