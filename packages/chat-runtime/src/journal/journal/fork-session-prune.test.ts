import { expect, test } from "bun:test";
import { asc } from "drizzle-orm";
import { chatJournal } from "../../db";
import { readSince } from "../../replay";
import { agentMessage, sessionState } from "../../testing/fixtures";
import { createTestRuntime } from "../../testing/testRuntime";
import { pruneStoredSessionEvents } from "./fork-session-prune";

const SESSION = "session-1";
const init = () => ({
	sessionId: SESSION,
	scopeId: "workspace-1",
	harness: "fake",
});

function kinds(runtime: ReturnType<typeof createTestRuntime>) {
	return runtime.db
		.select()
		.from(chatJournal)
		.orderBy(asc(chatJournal.sessionId), asc(chatJournal.seq))
		.all()
		.map(
			(row) => `${row.sessionId}:${row.seq}:${JSON.parse(row.eventJson).type}`,
		);
}

test("a new session event replaces the stored one and keeps items and seqs", () => {
	const runtime = createTestRuntime({ forkKeepLatestSessionEvent: true });
	const opened = runtime.journal.open(init());
	runtime.journal.append(SESSION, {
		type: "session",
		session: sessionState({ status: "running", title: "Build" }),
	});
	runtime.journal.append(SESSION, {
		type: "item",
		item: agentMessage("a", "a"),
		turnId: "turn-1",
	});
	runtime.journal.append(SESSION, {
		type: "session",
		session: sessionState({ status: "idle" }),
	});
	expect(kinds(runtime)).toEqual([`${SESSION}:2:item`, `${SESSION}:3:session`]);
	expect(runtime.sessions.get(SESSION)).toMatchObject({
		status: "idle",
		title: "Build",
	});

	runtime.journal.forget(SESSION);
	expect(runtime.journal.open(init()).lastSeq).toBe(3);
	const replay = readSince(runtime.db, SESSION, {
		epoch: opened.epoch,
		seq: 0,
	});
	expect(replay.ok && replay.envelopes.map((e) => e.cursor.seq)).toEqual([
		2, 3,
	]);
	expect(
		runtime.journal.append(SESSION, {
			type: "session",
			session: sessionState({ status: "running" }),
		}).seq,
	).toBe(4);
	expect(kinds(runtime)).toEqual([`${SESSION}:2:item`, `${SESSION}:4:session`]);
});

test("stored superseded session events are removed per session and epoch", async () => {
	const runtime = createTestRuntime();
	const row = (
		sessionId: string,
		epoch: string,
		seq: number,
		type: string,
	) => ({
		sessionId,
		epoch,
		seq,
		ts: seq,
		eventJson: JSON.stringify(
			type === "session"
				? { type, session: sessionState({ status: "idle" }) }
				: { type, item: agentMessage(`i${seq}`, "x"), turnId: "t" },
		),
	});
	runtime.db
		.insert(chatJournal)
		.values([
			row("a", "e1", 1, "session"),
			row("a", "e1", 2, "item"),
			row("a", "e1", 3, "session"),
			row("a", "e2", 1, "session"),
			row("b", "e1", 1, "item"),
			row("b", "e1", 2, "session"),
			row("b", "e1", 3, "session"),
			row("b", "e1", 4, "item"),
		])
		.run();
	let pauses = 0;
	const removed = await pruneStoredSessionEvents(runtime.db, async () => {
		pauses++;
	});
	expect(removed).toBe(2);
	expect(pauses).toBe(3);
	expect(
		runtime.db
			.select()
			.from(chatJournal)
			.orderBy(
				asc(chatJournal.sessionId),
				asc(chatJournal.epoch),
				asc(chatJournal.seq),
			)
			.all()
			.map((r) => `${r.sessionId}:${r.epoch}:${r.seq}`),
	).toEqual(["a:e1:2", "a:e1:3", "a:e2:1", "b:e1:1", "b:e1:3", "b:e1:4"]);
});
