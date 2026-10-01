import { describe, expect, test } from "bun:test";
import { STORAGE_FRAME_CHANNEL, STORAGE_HOST_CHANNEL } from "./page-storage";
import { PAGE_STORAGE_RUNTIME_SOURCE } from "./page-storage-runtime";

interface Harness {
	storage: {
		ready: Promise<boolean>;
		writable: boolean | null;
		get(key: string): Promise<unknown>;
		getAll(key: string): Promise<unknown[]>;
		set(key: string, value: unknown): Promise<void>;
		remove(key: string): Promise<void>;
		subscribe(key: string, onRecords: (records: unknown[]) => void): () => void;
	};
	sent: Record<string, unknown>[];
	toFrame(body: Record<string, unknown>): void;
}

function mount({ framed = true }: { framed?: boolean } = {}): Harness {
	const sent: Record<string, unknown>[] = [];
	const listeners: ((event: unknown) => void)[] = [];
	const win: Record<string, unknown> = {};
	const parent = framed
		? { postMessage: (message: Record<string, unknown>) => sent.push(message) }
		: win;
	if (!framed) win.postMessage = (m: Record<string, unknown>) => sent.push(m);

	const addEventListener = (type: string, fn: (event: unknown) => void) => {
		if (type === "message") listeners.push(fn);
	};

	new Function(
		"window",
		"parent",
		"addEventListener",
		"removeEventListener",
		"document",
		PAGE_STORAGE_RUNTIME_SOURCE,
	)(win, parent, addEventListener, () => {}, { visibilityState: "visible" });

	const superset = win.superset as { storage: Harness["storage"] };
	return {
		storage: superset.storage,
		sent,
		toFrame(body) {
			const event = {
				data: { channel: STORAGE_HOST_CHANNEL, ...body },
				source: parent,
			};
			for (const fn of [...listeners]) fn(event);
		},
	};
}

function lastCall(sent: Record<string, unknown>[]) {
	return sent.filter((m) => m.type === "call").at(-1);
}

function callCount(sent: Record<string, unknown>[]) {
	return sent.filter((m) => m.type === "call").length;
}

function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("page storage runtime", () => {
	test("knocks until the host answers, then reports itself ready", async () => {
		const h = mount();
		expect(h.sent.some((m) => m.type === "hello")).toBe(true);

		h.toFrame({ type: "hello", writable: true });
		expect(await h.storage.ready).toBe(true);
		expect(h.storage.writable).toBe(true);
	});

	test("a page with no host at all settles unavailable rather than hanging", async () => {
		const h = mount({ framed: false });
		expect(await h.storage.ready).toBe(false);
		await expect(h.storage.get("k")).rejects.toMatchObject({
			code: "unavailable",
		});
	});

	test("resolves each call against its own id", async () => {
		const h = mount();
		h.toFrame({ type: "hello", writable: true });
		await h.storage.ready;

		const first = h.storage.getAll("votes");
		await Promise.resolve();
		const firstId = lastCall(h.sent)?.id;

		const second = h.storage.get("votes");
		await Promise.resolve();
		const secondId = lastCall(h.sent)?.id;

		expect(firstId).not.toBe(secondId);

		h.toFrame({
			type: "result",
			id: secondId,
			ok: true,
			result: { op: "get", value: "Ramen" },
		});
		h.toFrame({
			type: "result",
			id: firstId,
			ok: true,
			result: { op: "getAll", records: [{ value: "Ramen" }] },
		});

		expect(await second).toBe("Ramen");
		expect(await first).toEqual([{ value: "Ramen" }]);
	});

	test("carries the host's error code through to the page", async () => {
		const h = mount();
		h.toFrame({ type: "hello", writable: true });
		await h.storage.ready;

		const pending = h.storage.set("votes", "Tacos");
		await Promise.resolve();
		const id = lastCall(h.sent)?.id;
		h.toFrame({
			type: "result",
			id,
			ok: false,
			code: "quota_exceeded",
			message: "quota_exceeded: a page stores at most 262144 bytes",
		});

		await expect(pending).rejects.toMatchObject({ code: "quota_exceeded" });
	});

	test("refuses an over-size value before it reaches the host", async () => {
		const h = mount();
		h.toFrame({ type: "hello", writable: true });
		await h.storage.ready;

		const before = h.sent.length;
		await expect(h.storage.set("k", "x".repeat(9000))).rejects.toMatchObject({
			code: "quota_exceeded",
		});
		expect(h.sent.length).toBe(before);
	});

	test("refuses a malformed key without calling out", async () => {
		const h = mount();
		h.toFrame({ type: "hello", writable: true });
		await h.storage.ready;

		const before = callCount(h.sent);
		await expect(h.storage.get("")).rejects.toMatchObject({ code: "invalid" });
		expect(callCount(h.sent)).toBe(before);
	});

	test("refuses a value postMessage could not clone, as invalid", async () => {
		const h = mount();
		h.toFrame({ type: "hello", writable: true });
		await h.storage.ready;

		const before = callCount(h.sent);
		await expect(h.storage.set("k", () => {})).rejects.toMatchObject({
			code: "invalid",
		});
		expect(callCount(h.sent)).toBe(before);
	});

	test("sends the JSON form of a value, not the object itself", async () => {
		const h = mount();
		h.toFrame({ type: "hello", writable: true });
		await h.storage.ready;

		h.storage.set("k", { keep: 1, drop: () => {}, when: new Date(0) });
		await Promise.resolve();
		expect((lastCall(h.sent)?.request as { value: unknown }).value).toEqual({
			keep: 1,
			when: "1970-01-01T00:00:00.000Z",
		});
	});

	test("a pushed change makes a subscriber re-read", async () => {
		const h = mount();
		h.toFrame({ type: "hello", writable: true });
		await h.storage.ready;

		const seen: unknown[][] = [];
		h.storage.subscribe("votes", (records) => seen.push(records));

		await flush();
		h.toFrame({
			type: "result",
			id: lastCall(h.sent)?.id,
			ok: true,
			result: { op: "getAll", records: [{ value: "Tacos" }] },
		});
		await flush();

		const before = callCount(h.sent);
		h.toFrame({ type: "changed", key: "votes" });
		await flush();
		expect(callCount(h.sent)).toBe(before + 1);

		h.toFrame({
			type: "result",
			id: lastCall(h.sent)?.id,
			ok: true,
			result: {
				op: "getAll",
				records: [{ value: "Tacos" }, { value: "Ramen" }],
			},
		});
		await flush();
		expect(seen.at(-1)).toHaveLength(2);
	});

	test("a change under another key leaves this subscriber alone", async () => {
		const h = mount();
		h.toFrame({ type: "hello", writable: true });
		await h.storage.ready;

		h.storage.subscribe("votes", () => {});
		await flush();
		h.toFrame({
			type: "result",
			id: lastCall(h.sent)?.id,
			ok: true,
			result: { op: "getAll", records: [] },
		});
		await flush();

		const before = callCount(h.sent);
		h.toFrame({ type: "changed", key: "something-else" });
		await flush();
		expect(callCount(h.sent)).toBe(before);
	});

	test("unsubscribing stops the pushes", async () => {
		const h = mount();
		h.toFrame({ type: "hello", writable: true });
		await h.storage.ready;

		const stop = h.storage.subscribe("votes", () => {});
		await flush();
		h.toFrame({
			type: "result",
			id: lastCall(h.sent)?.id,
			ok: true,
			result: { op: "getAll", records: [] },
		});
		await flush();
		stop();

		const before = callCount(h.sent);
		h.toFrame({ type: "changed", key: "votes" });
		await flush();
		expect(callCount(h.sent)).toBe(before);
	});

	test("posts calls on the frame channel", async () => {
		const h = mount();
		h.toFrame({ type: "hello", writable: true });
		await h.storage.ready;

		h.storage.remove("votes");
		await Promise.resolve();
		const call = lastCall(h.sent);
		expect(call?.channel).toBe(STORAGE_FRAME_CHANNEL);
		expect(call?.request).toEqual({ op: "remove", key: "votes" });
	});
});
