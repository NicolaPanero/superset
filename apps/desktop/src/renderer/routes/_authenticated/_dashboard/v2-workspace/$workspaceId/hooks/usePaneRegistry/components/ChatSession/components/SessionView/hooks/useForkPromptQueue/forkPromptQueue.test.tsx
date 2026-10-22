import { expect, test } from "bun:test";
import {
	deriveTimeline,
	emptySnapshot,
	type OutboxEntry,
	type SessionSnapshot,
} from "@superset/chat/core";
import type { UserContent, UserMessage } from "@superset/chat/protocol";
import type { ChatSession } from "@superset/chat/react";
import { useState } from "react";
import { act, renderHook } from "renderer/test-utils/fork-ui";
import { pageLinkFinder } from "../../../../utils/pageLinks";
import { transcriptRows } from "../../../Transcript/utils/transcriptRows";
import { useForkPromptQueue } from "./useForkPromptQueue";

function fixture(running = true, awaitingBackground = false) {
	const identity = {};
	let counter = 0;
	const view = renderHook(() => {
		const [snapshot, setSnapshot] = useState<SessionSnapshot>({
			...emptySnapshot(),
			session: {
				status: running ? "running" : "idle",
				harness: "acp:test",
				awaitingBackground,
				queueControls: true,
			},
		});
		const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
		const rawSend = (
			content: UserContent[],
			steer?: { expectedTurnId: string },
		) => {
			const id = `client-${++counter}`;
			const entry: OutboxEntry = {
				clientId: id,
				commandId: id,
				content,
				state: "inflight",
				attempts: 1,
				lastError: null,
				...(steer ? { steer } : {}),
			};
			setOutbox((previous) => [...previous, entry]);
			return entry;
		};
		const presentation = useForkPromptQueue(
			{ snapshot, outbox, sendPrompt: rawSend } as ChatSession,
			identity,
		);
		return { ...presentation, snapshot, setSnapshot, setOutbox };
	});
	const rows = () =>
		transcriptRows(
			deriveTimeline(view.result.current.snapshot),
			view.result.current.outbox,
			new Set(),
			pageLinkFinder("https://example.test"),
		);
	return { view, rows };
}

const content: UserContent[] = [
	{
		type: "text",
		text: 'Queued image\n<attachment path=".superset/attachments/image.png" type="image/png" />',
	},
];

test("a queued image goes straight to its stable queue row before a delayed server echo, never into the transcript", () => {
	const { view, rows } = fixture();
	act(() => {
		view.result.current.sendPrompt(content);
	});
	const pending = view.result.current.prompts[0];
	expect(pending).toMatchObject({
		clientId: "client-1",
		forkPending: true,
		content,
	});
	expect(rows()).toEqual([]);
	act(() => {
		view.result.current.setSnapshot({
			...emptySnapshot(),
			session: { status: "idle", harness: "acp:test" },
		});
	});
	expect(view.result.current.prompts[0]?.clientId).toBe(pending?.clientId);
	expect(rows()).toEqual([]);
	const echoed: UserMessage = {
		id: "server-1",
		clientId: "client-1",
		kind: "user_message",
		startedAtMs: 1,
		queued: true,
		content,
	};
	act(() => {
		view.result.current.setSnapshot({
			...emptySnapshot(),
			items: new Map([[echoed.id, { item: echoed, turnId: "next" }]]),
		});
	});
	expect(view.result.current.prompts).toHaveLength(1);
	expect(view.result.current.prompts[0]?.clientId).toBe(pending?.clientId);
	expect(view.result.current.prompts[0]?.forkPending).toBeUndefined();
	expect(rows()).toEqual([]);
	act(() => {
		view.result.current.setOutbox([]);
	});
	expect(view.result.current.prompts).toHaveLength(1);
});

test("new idle prompts, explicit steering and implicit background steering keep their normal transcript preview", () => {
	for (const [running, background, steer] of [
		[false, false, false],
		[true, false, true],
		[true, true, false],
	]) {
		const { view, rows } = fixture(running, background);
		act(() => {
			view.result.current.sendPrompt(
				content,
				steer ? { expectedTurnId: "active" } : undefined,
			);
		});
		expect(view.result.current.prompts).toEqual([]);
		expect(rows().map((row) => row.kind)).toEqual(["outbox"]);
		view.unmount();
	}
});

test("a failed queued send leaves the queue preview and remains available for the existing error recovery", () => {
	const { view, rows } = fixture();
	act(() => {
		view.result.current.sendPrompt(content);
	});
	act(() => {
		view.result.current.setOutbox((entries) =>
			entries.map((entry) => ({
				...entry,
				state: "failed",
				lastError: "offline",
			})),
		);
	});
	expect(view.result.current.prompts).toEqual([]);
	expect(rows()).toMatchObject([
		{ kind: "outbox", entry: { state: "failed" } },
	]);
});

test("two sends in one frame put the second prompt directly in the queue", () => {
	const { view, rows } = fixture(false);
	act(() => {
		view.result.current.sendPrompt([{ type: "text", text: "First" }]);
		view.result.current.sendPrompt(content);
	});
	expect(view.result.current.prompts).toMatchObject([
		{ clientId: "client-2", content },
	]);
	expect(rows()).toMatchObject([
		{ kind: "outbox", entry: { clientId: "client-1" } },
	]);
});
