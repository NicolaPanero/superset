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

export function pageStorageAdminPath(pageId: string): string {
	return `/v2/page/${encodeURIComponent(pageId)}/storage/admin`;
}

export function pageStorageNudgePath(pageId: string): string {
	return `/v2/page/${encodeURIComponent(pageId)}/storage/manifest-changed`;
}

export function pageStorageTicketPath(pageId: string): string {
	return `/v2/page/${encodeURIComponent(pageId)}/storage/ticket`;
}

export function pageStorageSocketPath(pageId: string): string {
	return `/v2/page/${encodeURIComponent(pageId)}/storage/socket`;
}
