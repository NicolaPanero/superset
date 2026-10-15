import { expect, test } from "bun:test";
import { emptySnapshot, type SessionSnapshot } from "@superset/chat/core";
import type { Item } from "@superset/chat/protocol";
import { forkMessagePoint } from "./forkMessagePoint";

function conversation(): SessionSnapshot {
	const snapshot = emptySnapshot();
	const rows: [Item, string][] = [
		[
			{
				id: "u1",
				kind: "user_message",
				startedAtMs: 1,
				content: [{ type: "text", text: "first" }],
			},
			"t1",
		],
		[
			{
				id: "a1",
				kind: "agent_message",
				nativeMessageId: "native:a1",
				startedAtMs: 2,
				text: "first answer",
			},
			"t1",
		],
		[
			{
				id: "u2",
				kind: "user_message",
				startedAtMs: 3,
				content: [{ type: "text", text: "second" }],
			},
			"t2",
		],
		[
			{
				id: "a2",
				kind: "agent_message",
				nativeMessageId: "native:a2",
				startedAtMs: 4,
				text: "second answer",
			},
			"t2",
		],
	];
	return {
		...snapshot,
		items: new Map(rows.map(([item, turnId]) => [item.id, { item, turnId }])),
	};
}

test("a user fork excludes that prompt and all later replies", () => {
	expect(forkMessagePoint(conversation(), "u2")).toEqual({
		point: { messageId: "native:a1" },
	});
});

test("the first user message opens an empty conversation", () => {
	expect(forkMessagePoint(conversation(), "u1")).toEqual({ point: undefined });
});

test("an agent fork includes the selected reply", () => {
	expect(forkMessagePoint(conversation(), "a1")).toEqual({
		point: { messageId: "native:a1" },
	});
});

test("legacy journal ids preserve native ids containing colons", () => {
	const snapshot = conversation();
	const items = new Map(snapshot.items);
	items.delete("a1");
	items.set("agent_message:t1:native:a1", {
		turnId: "t1",
		item: {
			id: "agent_message:t1:native:a1",
			kind: "agent_message",
			startedAtMs: 2,
			text: "answer",
		},
	});
	expect(forkMessagePoint({ ...snapshot, items }, "u2")).toEqual({
		point: { messageId: "native:a1" },
	});
});

test("a missing native prefix never silently creates an empty conversation", () => {
	const snapshot = conversation();
	const items = new Map(snapshot.items);
	items.set("a1", {
		turnId: "t1",
		item: { id: "a1", kind: "agent_message", startedAtMs: 2, text: "answer" },
	});
	expect(() => forkMessagePoint({ ...snapshot, items }, "u2")).toThrow(
		"no native fork point",
	);
	expect(() => forkMessagePoint(snapshot, "missing")).toThrow(
		"not in this session",
	);
});

test("a steered user message cannot drop earlier prompts in the same turn", () => {
	const snapshot = conversation();
	const items = new Map(snapshot.items);
	items.set("steer", {
		turnId: "t2",
		item: {
			id: "steer",
			kind: "user_message",
			startedAtMs: 5,
			content: [{ type: "text", text: "steer" }],
		},
	});
	expect(() => forkMessagePoint({ ...snapshot, items }, "steer")).toThrow(
		"steered turn",
	);
});
