const stopped = new Set<string>();
export function markChatStopped(terminalId: string): void {
	stopped.add(terminalId);
}
export function consumeChatStopped(terminalId: string): boolean {
	return stopped.delete(terminalId);
}
