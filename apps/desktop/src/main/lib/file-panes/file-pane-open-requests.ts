import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";

export type FilePaneOpenTarget = "current-tab" | "new-tab";

export interface FilePaneOpenRequest {
	requestId: string;
	workspaceId: string;
	projectId: string | null;
	paths: string[];
	line?: number;
	target: FilePaneOpenTarget;
}

export type FilePaneOpenOutcome =
	| { ok: true; paneIds: string[] }
	| { ok: false; error: string };

export class FilePaneOpenTimeoutError extends Error {
	constructor() {
		super(
			"No workspace view picked up the file-open request. Is the desktop app running and signed in?",
		);
		this.name = "FilePaneOpenTimeoutError";
	}
}

export class FilePaneOpenRejectedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "FilePaneOpenRejectedError";
	}
}

interface PendingRequest {
	settle: (outcome: FilePaneOpenOutcome) => void;
	timer: ReturnType<typeof setTimeout>;
}

/**
 * File panes exist only in the renderer, so the main process cannot open one
 * itself. A request is broadcast to every window over `open-request`; the
 * workspace view that handles it reports the pane ids back through
 * `resolve`, which settles the promise the bridge is waiting on.
 */
export class FilePaneOpenRequests extends EventEmitter {
	private readonly pending = new Map<string, PendingRequest>();

	request(
		input: Omit<FilePaneOpenRequest, "requestId">,
		timeoutMs: number,
	): Promise<string[]> {
		const requestId = randomBytes(8).toString("hex");
		const request: FilePaneOpenRequest = { ...input, requestId };
		return new Promise<string[]>((resolve, reject) => {
			const settle = (outcome: FilePaneOpenOutcome) => {
				const entry = this.pending.get(requestId);
				if (!entry) return;
				clearTimeout(entry.timer);
				this.pending.delete(requestId);
				if (outcome.ok) resolve(outcome.paneIds);
				else reject(new FilePaneOpenRejectedError(outcome.error));
			};
			const timer = setTimeout(() => {
				this.pending.delete(requestId);
				reject(new FilePaneOpenTimeoutError());
			}, timeoutMs);
			this.pending.set(requestId, { settle, timer });
			this.emit("open-request", request);
		});
	}

	/** Returns false when the request already settled or never existed. */
	resolve(requestId: string, outcome: FilePaneOpenOutcome): boolean {
		const entry = this.pending.get(requestId);
		if (!entry) return false;
		entry.settle(outcome);
		return true;
	}

	pendingCount(): number {
		return this.pending.size;
	}
}

export const filePaneOpenRequests = new FilePaneOpenRequests();
