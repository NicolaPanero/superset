/**
 * The wire between the API and a page's storage hub.
 *
 * Records live in one Durable Object per page — never in Postgres — so the
 * object that owns them is also the only writer, and a burst of votes is
 * applied in order with no last-writer-wins ambiguity. The API stays in front
 * of it because page readability is a Postgres question (visibility, author,
 * takedown) that the hub cannot answer.
 *
 * The hub stores opaque user ids and nothing else about a person. Display
 * names are resolved by the API on the way out, which keeps them fresh when
 * someone is renamed and keeps the hub free of anything personal.
 */

export interface PageStorageHubRecord {
	userId: string;
	value: unknown;
	sizeBytes: number;
	/** Milliseconds since the epoch, as SQLite holds it. */
	updatedAt: number;
}

export type PageStorageHubRequest =
	| { op: "get"; userId: string; key: string }
	| { op: "getAll"; key: string }
	| { op: "set"; userId: string; key: string; value: unknown }
	| { op: "remove"; userId: string; key: string }
	| { op: "list" }
	| { op: "clear"; key?: string }
	/** Everything one person wrote on this page, for an account purge. */
	| { op: "clearUser"; userId: string };

export type PageStorageHubResponse =
	| { ok: true; op: "get"; record: PageStorageHubRecord | null }
	| { ok: true; op: "getAll"; records: PageStorageHubRecord[] }
	| { ok: true; op: "set" }
	| { ok: true; op: "remove" }
	| {
			ok: true;
			op: "list";
			records: (PageStorageHubRecord & { key: string })[];
			totalBytes: number;
	  }
	| { ok: true; op: "clear"; cleared: number }
	| { ok: true; op: "clearUser"; cleared: number }
	| { ok: false; code: "quota_exceeded" | "invalid"; message: string };

/** What a caller sees once the failure case has been turned into a throw. */
export type PageStorageHubSuccess = Extract<
	PageStorageHubResponse,
	{ ok: true }
>;

/** The one reply shape an op can produce, so a caller needs no guard. */
export type PageStorageHubReplyFor<Op extends PageStorageHubRequest["op"]> =
	Extract<PageStorageHubSuccess, { op: Op }>;

/** What a connected viewer hears when any record on the page changes. */
export interface PageStorageChangedMessage {
	type: "storage-changed";
	/** Absent when every key was cleared at once. */
	key?: string;
}

export function parsePageStorageChanged(
	raw: unknown,
): PageStorageChangedMessage | null {
	if (typeof raw !== "string") return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (
		typeof parsed !== "object" ||
		parsed === null ||
		(parsed as { type?: unknown }).type !== "storage-changed"
	) {
		return null;
	}
	const key = (parsed as { key?: unknown }).key;
	return {
		type: "storage-changed",
		...(typeof key === "string" ? { key } : {}),
	};
}

/** Where the API posts an op, relative to the realtime origin. */
export function pageStorageOpPath(pageId: string): string {
	return `/v2/page/${encodeURIComponent(pageId)}/storage`;
}

/** Where a viewer's window subscribes, relative to the realtime origin. */
export function pageStorageSubscribePath(pageId: string): string {
	return `/v2/page/${encodeURIComponent(pageId)}/storage/subscribe`;
}
