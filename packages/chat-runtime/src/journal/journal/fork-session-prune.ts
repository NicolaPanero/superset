import { and, eq, lt, sql } from "drizzle-orm";
import type { ChatDb } from "../../db";
import { chatJournal } from "../../db";

// Rows are written by JSON.stringify of the parsed event, whose `type` comes first.
const isSessionEvent = sql`substr(${chatJournal.eventJson}, 1, 17) = '{"type":"session"'`;
const MAX_TRACKED = 1024;
const latestSessionSeq = new WeakMap<ChatDb, Map<string, number>>();

/**
 * Each session event replaces the whole session state and repeats every list
 * the agent reports, so only the newest one is worth keeping. Clients accept
 * gaps in the sequence.
 */
export function keepLatestSessionEvent(
	db: ChatDb,
	sessionId: string,
	epoch: string,
	seq: number,
): void {
	let known = latestSessionSeq.get(db);
	if (!known) {
		known = new Map();
		latestSessionSeq.set(db, known);
	}
	const key = `${sessionId}\u0000${epoch}`;
	const previous = known.get(key);
	const scope = and(
		eq(chatJournal.sessionId, sessionId),
		eq(chatJournal.epoch, epoch),
	);
	db.delete(chatJournal)
		.where(
			previous === undefined
				? and(scope, lt(chatJournal.seq, seq), isSessionEvent)
				: and(scope, eq(chatJournal.seq, previous)),
		)
		.run();
	known.delete(key);
	known.set(key, seq);
	if (known.size > MAX_TRACKED) {
		const oldest = known.keys().next().value;
		if (oldest !== undefined) known.delete(oldest);
	}
}

/** Removes superseded session events already stored, one session at a time. */
export async function pruneStoredSessionEvents(
	db: ChatDb,
	pause: () => Promise<void> = () =>
		new Promise((resolve) => setImmediate(resolve)),
): Promise<number> {
	const sessions = db
		.selectDistinct({
			sessionId: chatJournal.sessionId,
			epoch: chatJournal.epoch,
		})
		.from(chatJournal)
		.all();
	let removed = 0;
	for (const { sessionId, epoch } of sessions) {
		const scope = and(
			eq(chatJournal.sessionId, sessionId),
			eq(chatJournal.epoch, epoch),
		);
		const latest = db
			.select({ seq: sql<number | null>`max(${chatJournal.seq})` })
			.from(chatJournal)
			.where(and(scope, isSessionEvent))
			.get()?.seq;
		if (latest != null)
			removed += db
				.delete(chatJournal)
				.where(and(scope, lt(chatJournal.seq, latest), isSessionEvent))
				.run().changes;
		await pause();
	}
	return removed;
}
