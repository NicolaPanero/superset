export const STORAGE_FRAME_CHANNEL = "superset-storage/frame";
export const STORAGE_HOST_CHANNEL = "superset-storage/host";

export const MAX_PAGE_STORAGE_VALUE_BYTES = 8 * 1024;
export const MAX_PAGE_STORAGE_KEYS_PER_USER = 128;
export const MAX_PAGE_STORAGE_BYTES = 256 * 1024;
export const MAX_PAGE_STORAGE_KEY_LENGTH = 128;

export type PageStorageErrorCode =
	| "unavailable"
	| "unauthenticated"
	| "quota_exceeded"
	| "invalid";

export interface PageStorageRecord {
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

export type PageStorageFrameMessage =
	| { channel: typeof STORAGE_FRAME_CHANNEL; type: "hello" }
	| {
			channel: typeof STORAGE_FRAME_CHANNEL;
			type: "call";
			id: string;
			request: PageStorageOp;
	  };

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

export type PageStorageHandler = (
	op: PageStorageOp,
) => Promise<PageStorageResult>;

export interface PageStoragePort {
	call: PageStorageHandler;
	watch?: (onChange: (key?: string) => void) => () => void;
}

export function pageStorageValueBytes(value: unknown): number {
	return new TextEncoder().encode(JSON.stringify(value ?? null)).length;
}
