export class ForkCursorPromptFailure {
	private failure?: { turnId: string; error: Error };

	capture(turnId: string, chunk: string): void {
		// Cursor 2026.10.01 catches provider failures and sends this whole ACP
		// chunk, then returns a successful session/prompt result.
		if (
			chunk.length > 4096 ||
			!/^\n\nError: RetriableError: \[(unavailable|resource_exhausted)\] [^\r\n]+$/.test(
				chunk,
			)
		) {
			this.failure = undefined;
			return;
		}
		this.failure = { turnId, error: new Error(chunk.trimStart()) };
	}

	assertSucceeded(turnId: string): void {
		const failure = this.failure;
		this.failure = undefined;
		if (failure?.turnId === turnId) throw failure.error;
	}
}
