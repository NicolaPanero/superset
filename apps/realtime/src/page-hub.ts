import {
	MAX_PAGE_STORAGE_BYTES,
	MAX_PAGE_STORAGE_KEYS_PER_USER,
	MAX_PAGE_STORAGE_VALUE_BYTES,
} from "@superset/shared/page-storage";
import type {
	PageStorageChangedMessage,
	PageStorageHubRecord,
	PageStorageHubRequest,
	PageStorageHubResponse,
} from "@superset/shared/page-storage-hub";
import { Server } from "partyserver";
import type { RealtimeEnv } from "./types";

// A type alias, not an interface: the SQLite cursor's row generic requires an
// implicit index signature, which an interface does not get.
type Row = {
	key: string;
	user_id: string;
	value: string;
	size_bytes: number;
	updated_at: number;
};

/**
 * One object per page: everything that page remembers across its viewers,
 * and every window currently watching it.
 *
 * This is the whole store — there is no copy in Postgres. Being one object
 * per page is what makes that safe: the platform routes every write for a
 * page here, and this object applies them one at a time, so a vote is never
 * racing another vote. Its SQLite survives hibernation and redeploys.
 *
 * It holds opaque user ids. Names are the API's business, resolved on the way
 * out, so renaming someone does not leave a stale copy here.
 */
export class PageHub extends Server<RealtimeEnv> {
	static options = { hibernate: true };

	private ready = false;

	private schema(): void {
		if (this.ready) return;
		this.ctx.storage.sql.exec(
			`CREATE TABLE IF NOT EXISTS records (
				key TEXT NOT NULL,
				user_id TEXT NOT NULL,
				value TEXT NOT NULL,
				size_bytes INTEGER NOT NULL,
				updated_at INTEGER NOT NULL,
				PRIMARY KEY (key, user_id)
			)`,
		);
		this.ready = true;
	}

	// ── RPC (called by the Worker, which has already checked the secret) ──

	async apply(request: PageStorageHubRequest): Promise<PageStorageHubResponse> {
		this.schema();
		switch (request.op) {
			case "get":
				return {
					ok: true,
					op: "get",
					record: this.one(request.key, request.userId),
				};
			case "getAll":
				return { ok: true, op: "getAll", records: this.forKey(request.key) };
			case "set":
				return this.set(request.userId, request.key, request.value);
			case "remove":
				return this.remove(request.userId, request.key);
			case "list":
				return this.list();
			case "clear":
				return this.clear(request.key);
			case "clearUser":
				return this.clearUser(request.userId);
		}
	}

	async subscriberCount(): Promise<number> {
		let count = 0;
		for (const _ of this.getConnections()) count++;
		return count;
	}

	// ── Reads ─────────────────────────────────────────────────────────────

	private one(key: string, userId: string): PageStorageHubRecord | null {
		const [row] = this.ctx.storage.sql
			.exec<Row>(
				"SELECT key, user_id, value, size_bytes, updated_at FROM records WHERE key = ? AND user_id = ?",
				key,
				userId,
			)
			.toArray();
		return row ? toRecord(row) : null;
	}

	private forKey(key: string): PageStorageHubRecord[] {
		return this.ctx.storage.sql
			.exec<Row>(
				"SELECT key, user_id, value, size_bytes, updated_at FROM records WHERE key = ? ORDER BY updated_at",
				key,
			)
			.toArray()
			.map(toRecord);
	}

	private list(): PageStorageHubResponse {
		const rows = this.ctx.storage.sql
			.exec<Row>(
				"SELECT key, user_id, value, size_bytes, updated_at FROM records ORDER BY key, updated_at",
			)
			.toArray();
		return {
			ok: true,
			op: "list",
			records: rows.map((row) => ({ ...toRecord(row), key: row.key })),
			totalBytes: rows.reduce((sum, row) => sum + row.size_bytes, 0),
		};
	}

	// ── Writes ────────────────────────────────────────────────────────────

	private set(
		userId: string,
		key: string,
		value: unknown,
	): PageStorageHubResponse {
		const encoded = JSON.stringify(value ?? null);
		const sizeBytes = new TextEncoder().encode(encoded).length;
		if (sizeBytes > MAX_PAGE_STORAGE_VALUE_BYTES) {
			return {
				ok: false,
				code: "quota_exceeded",
				message: `quota_exceeded: a stored value is at most ${MAX_PAGE_STORAGE_VALUE_BYTES} bytes`,
			};
		}

		// Measured here because this object is the only writer, so what it
		// reads cannot be stale by the time it writes.
		const [usage] = this.ctx.storage.sql
			.exec<{ total: number; mine: number; replacing: number }>(
				`SELECT
					coalesce(sum(size_bytes), 0) AS total,
					count(*) FILTER (WHERE user_id = ?) AS mine,
					coalesce(sum(size_bytes) FILTER (WHERE user_id = ? AND key = ?), 0) AS replacing
				FROM records`,
				userId,
				userId,
				key,
			)
			.toArray();

		const existing = this.one(key, userId);
		if (!existing && (usage?.mine ?? 0) >= MAX_PAGE_STORAGE_KEYS_PER_USER) {
			return {
				ok: false,
				code: "quota_exceeded",
				message: `quota_exceeded: at most ${MAX_PAGE_STORAGE_KEYS_PER_USER} keys per person on a page`,
			};
		}
		const totalAfter =
			(usage?.total ?? 0) - (usage?.replacing ?? 0) + sizeBytes;
		if (totalAfter > MAX_PAGE_STORAGE_BYTES) {
			return {
				ok: false,
				code: "quota_exceeded",
				message: `quota_exceeded: a page stores at most ${MAX_PAGE_STORAGE_BYTES} bytes`,
			};
		}

		this.ctx.storage.sql.exec(
			`INSERT INTO records (key, user_id, value, size_bytes, updated_at)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT (key, user_id) DO UPDATE SET
				value = excluded.value,
				size_bytes = excluded.size_bytes,
				updated_at = excluded.updated_at`,
			key,
			userId,
			encoded,
			sizeBytes,
			Date.now(),
		);

		this.announce(key);
		return { ok: true, op: "set" };
	}

	private remove(userId: string, key: string): PageStorageHubResponse {
		this.ctx.storage.sql.exec(
			"DELETE FROM records WHERE key = ? AND user_id = ?",
			key,
			userId,
		);
		this.announce(key);
		return { ok: true, op: "remove" };
	}

	private clear(key?: string): PageStorageHubResponse {
		const before = this.count();
		if (key === undefined) {
			this.ctx.storage.sql.exec("DELETE FROM records");
		} else {
			this.ctx.storage.sql.exec("DELETE FROM records WHERE key = ?", key);
		}
		const cleared = before - this.count();
		this.announce(key);
		return { ok: true, op: "clear", cleared };
	}

	/**
	 * Drops everything one person wrote here. Called when their account is
	 * purged, which is the one deletion a page-scoped object cannot notice
	 * on its own.
	 */
	private clearUser(userId: string): PageStorageHubResponse {
		const before = this.count();
		this.ctx.storage.sql.exec("DELETE FROM records WHERE user_id = ?", userId);
		const cleared = before - this.count();
		if (cleared > 0) this.announce();
		return { ok: true, op: "clearUser", cleared };
	}

	private count(): number {
		const [row] = this.ctx.storage.sql
			.exec<{ n: number }>("SELECT count(*) AS n FROM records")
			.toArray();
		return row?.n ?? 0;
	}

	// ── Fan-out ───────────────────────────────────────────────────────────

	/**
	 * Tells every watching window that something under `key` moved. The
	 * message carries no values: a subscriber re-reads through the API, which
	 * is the only thing that may decide what that viewer can see.
	 */
	private announce(key?: string): void {
		const message: PageStorageChangedMessage = {
			type: "storage-changed",
			...(key !== undefined ? { key } : {}),
		};
		this.broadcast(JSON.stringify(message));
	}
}

function toRecord(row: Row): PageStorageHubRecord {
	let value: unknown = null;
	try {
		value = JSON.parse(row.value);
	} catch {
		value = null;
	}
	return {
		userId: row.user_id,
		value,
		sizeBytes: row.size_bytes,
		updatedAt: row.updated_at,
	};
}
