/**
 * A page is served with no network of its own, so a page that needs to
 * remember something across viewers asks the host to do it. This is the
 * contract for that: the ops a page may request, the results it gets back,
 * and the ceilings the API enforces before the row is written.
 *
 * Writes are always scoped to the viewer making them. A page reads its own
 * record or everyone's, and can never overwrite a record it does not own.
 */

export const STORAGE_FRAME_CHANNEL = "superset-storage/frame";
export const STORAGE_HOST_CHANNEL = "superset-storage/host";

/**
 * Small on purpose: this is for votes, claims and checklists, not datasets.
 * Clients enforce them so a write that cannot succeed is refused while the
 * page still has the value in hand; the API enforces them again because a
 * client is not a gate.
 */
export const MAX_PAGE_STORAGE_VALUE_BYTES = 8 * 1024;
export const MAX_PAGE_STORAGE_KEYS_PER_USER = 128;
export const MAX_PAGE_STORAGE_BYTES = 256 * 1024;
export const MAX_PAGE_STORAGE_KEY_LENGTH = 128;

export type PageStorageErrorCode =
	/** No host is listening, or its grant went away mid-visit. */
	| "unavailable"
	/** Nobody is signed in on this view, so there is no record to own. */
	| "unauthenticated"
	/** A ceiling above is full; the message names which. */
	| "quota_exceeded"
	/** The key or value breaks the contract. Retrying cannot help. */
	| "invalid";

export interface PageStorageRecord {
	/** Whose record this is. Ids only — a name goes stale. */
	userId: string;
	name: string;
	value: unknown;
	updatedAt: string;
}

export type PageStorageOp =
	| { op: "get"; key: string }
	| { op: "getAll"; key: string }
	| { op: "set"; key: string; value: unknown }
	| { op: "remove"; key: string };

export type PageStorageResult =
	| { op: "get"; value: unknown }
	| { op: "getAll"; records: PageStorageRecord[] }
	| { op: "set" }
	| { op: "remove" };

/** frame -> host. A call is correlated to its result by `id`. */
export type PageStorageFrameMessage =
	| { channel: typeof STORAGE_FRAME_CHANNEL; type: "hello" }
	| {
			channel: typeof STORAGE_FRAME_CHANNEL;
			type: "call";
			id: string;
			request: PageStorageOp;
	  };

/**
 * host -> frame. `hello` answers the runtime's handshake; `changed` is the
 * page's hub reporting that someone else wrote, which is what turns
 * `subscribe` from a poll into a push.
 */
export type PageStorageResponse =
	| { channel: typeof STORAGE_HOST_CHANNEL; type: "hello"; writable: boolean }
	| { channel: typeof STORAGE_HOST_CHANNEL; type: "changed"; key?: string }
	| {
			channel: typeof STORAGE_HOST_CHANNEL;
			type: "result";
			id: string;
			ok: true;
			result: PageStorageResult;
	  }
	| {
			channel: typeof STORAGE_HOST_CHANNEL;
			type: "result";
			id: string;
			ok: false;
			code: PageStorageErrorCode;
			message: string;
	  };

/**
 * What a host supplies to serve the page's calls. It runs as the signed-in
 * viewer, which is the whole reason the page cannot do this itself.
 */
export type PageStorageHandler = (
	op: PageStorageOp,
) => Promise<PageStorageResult>;

/**
 * The host's whole half of the bridge: serve calls, and optionally report
 * other people's writes as they land. Without `watch` a page still works —
 * `subscribe` falls back to re-reading on focus and on a slow timer.
 */
export interface PageStoragePort {
	call: PageStorageHandler;
	watch?: (onChange: (key?: string) => void) => () => void;
}

export function pageStorageValueBytes(value: unknown): number {
	return new TextEncoder().encode(JSON.stringify(value ?? null)).length;
}
