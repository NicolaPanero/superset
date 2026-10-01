export interface PageStorageHubRecord {
	userId: string;
	value: unknown;
	sizeBytes: number;
	updatedAt: number;
}

export type PageStorageHubRequest =
	| { op: "get"; userId: string; key: string }
	| { op: "getAll"; key: string }
	| { op: "set"; userId: string; key: string; value: unknown }
	| { op: "remove"; userId: string; key: string }
	| { op: "list" }
	| { op: "clear"; key?: string }
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

export type PageStorageHubSuccess = Extract<
	PageStorageHubResponse,
	{ ok: true }
>;

export type PageStorageHubReplyFor<Op extends PageStorageHubRequest["op"]> =
	Extract<PageStorageHubSuccess, { op: Op }>;

export interface PageStorageChangedMessage {
	type: "storage-changed";
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

export function pageStorageOpPath(pageId: string): string {
	return `/v2/page/${encodeURIComponent(pageId)}/storage`;
}

export function pageStorageSubscribePath(pageId: string): string {
	return `/v2/page/${encodeURIComponent(pageId)}/storage/subscribe`;
}

/**
 * Where the API tells a hub its manifest moved. The hub re-reads access and
 * drops what no longer passes; storage keeps working if the nudge is lost,
 * just against a stale view until its own timed re-read.
 */
export function pageStorageNudgePath(pageId: string): string {
	return `/v2/page/${encodeURIComponent(pageId)}/storage/manifest-changed`;
}
