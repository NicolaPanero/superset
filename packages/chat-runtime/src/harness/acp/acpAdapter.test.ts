import { describe, expect, it } from "bun:test";
import type { Item } from "@superset/chat/protocol";
import {
	AGENT_DEFAULT_MODE,
	FULL_ACCESS_CHAT_MODE,
	userMessageSchema,
} from "@superset/chat/protocol";
import type { AdapterEvent } from "../types";
import {
	AcpAdapter,
	type AcpAdapterOptions,
	type AcpImageStoreContext,
} from "./acpAdapter";
import { AIR_CLIENT_META } from "./air";
import type { AcpImageSource } from "./imageBlocks";
import type { AcpTransport, AcpTransportHandlers } from "./rpcClient";

/**
 * A scripted ACP agent: auto-responds to initialize/session_new, and for
 * session/prompt delivers a canned stream of session/update notifications
 * before returning the stop reason. Captures client->agent frames for
 * assertions.
 */
class FakeAcpAgent {
	readonly sent: Array<Record<string, unknown>> = [];
	/** Answer session/load with "Resource not found", as a never-prompted
	 * session does. */
	loadFails = false;
	/** Answer session/load with this error instead. */
	loadError: { code: number; message: string } | null = null;
	/** Answer nothing, as an agent stuck on a login prompt does. */
	silent = false;
	/** What the agent answers `initialize` with; older agents answer 1. */
	protocolVersion = 2;
	/** Session capabilities advertised at initialize; both shipped agents fork. */
	sessionCapabilities: Record<string, unknown> | null = { fork: {} };
	/** Replay history with v2's whole-message variants instead of chunks. */
	wholeMessageReplay = false;
	replayUpdates: Record<string, unknown>[] | null = null;
	foreignUpdateDuringLoad: Record<string, unknown> | null = null;
	newSessionConfigOptions: Array<Record<string, unknown>> | null = null;
	/** v1's session/new `modes` block; v2 agents report the mode as a config option. */
	newSessionModes: Record<string, unknown> | null = null;
	/** Reported while a session loads, as an agent restoring its saved options does. */
	loadConfigOptions: Array<Record<string, unknown>> | null = null;
	/** Hold mode and option answers until `releaseSelections`. */
	holdSelections = false;
	rejectSelections = false;
	private heldSelections: number[] = [];
	private heldPrompts: number[] = [];
	/** Advertise `_session/steering` and answer it with this outcome. */
	steeringOutcome: string | null = null;
	/** Leave session/prompt unanswered, as a turn still running does. */
	holdPrompts = false;
	private handlers!: AcpTransportHandlers;

	transport(handlers: AcpTransportHandlers): AcpTransport {
		this.handlers = handlers;
		return {
			send: (line) => this.onSend(line),
			close: async () => undefined,
		};
	}

	private deliver(frame: Record<string, unknown>): void {
		this.handlers.onLine(JSON.stringify(frame));
	}

	private respond(id: number, result: unknown): void {
		this.deliver({ jsonrpc: "2.0", id, result });
	}

	exit(code: number): void {
		this.handlers.onExit(code, null);
	}

	stderr(chunk: string): void {
		this.handlers.onStderr(chunk);
	}

	notify(sessionId: string, update: Record<string, unknown>): void {
		this.deliver({
			jsonrpc: "2.0",
			method: "session/update",
			params: { sessionId, update },
		});
	}

	/** Ask the agent to request a permission mid-turn; returns the request id. */
	requestPermission(sessionId: string, toolCallId: string, id = 9001): number {
		this.deliver({
			jsonrpc: "2.0",
			id,
			method: "session/request_permission",
			params: {
				sessionId,
				toolCall: { toolCallId, title: "Run tests" },
				options: [
					{ optionId: "allow", name: "Allow", kind: "allow_once" },
					{ optionId: "reject", name: "Reject", kind: "reject_once" },
				],
			},
		});
		return id;
	}

	requestElicitation(params: Record<string, unknown>, id = 9002): number {
		this.deliver({
			jsonrpc: "2.0",
			id,
			method: "elicitation/create",
			params: { mode: "form", sessionId: "sess-1", ...params },
		});
		return id;
	}

	cancelRequest(requestId: number): void {
		this.deliver({
			jsonrpc: "2.0",
			method: "$/cancel_request",
			params: { requestId },
		});
	}

	releasePrompts(stopReason: string): void {
		for (const id of this.heldPrompts.splice(0)) {
			this.respond(id, { stopReason });
		}
	}

	responseTo(id: number): Record<string, unknown> | undefined {
		return this.sent.find((frame) => frame.id === id && !frame.method);
	}

	releaseSelections(): void {
		for (const id of this.heldSelections.splice(0)) this.respond(id, null);
	}

	requestServer(method: string, params: unknown, id: number): void {
		this.deliver({ jsonrpc: "2.0", id, method, params });
	}

	lastPermissionResponse(): Record<string, unknown> | undefined {
		return this.sent.find((f) => f.id === 9001);
	}

	private onSend(line: string): void {
		const frame = JSON.parse(line) as {
			id?: number;
			method?: string;
			params?: Record<string, unknown>;
		};
		this.sent.push(frame as Record<string, unknown>);
		if (frame.id === undefined || frame.method === undefined) return;
		if (this.silent) return;

		queueMicrotask(() => {
			if (frame.method === "authenticate") {
				this.respond(frame.id as number, null);
				return;
			}
			if (frame.method === "initialize") {
				this.respond(frame.id as number, {
					...(this.steeringOutcome
						? { _meta: { steering: { supported: true } } }
						: {}),
					protocolVersion: this.protocolVersion,
					capabilities: {
						promptCapabilities: { image: true },
						...(this.sessionCapabilities
							? { sessionCapabilities: this.sessionCapabilities }
							: {}),
					},
				});
			} else if (frame.method === "session/new") {
				this.respond(frame.id as number, {
					sessionId: "sess-1",
					...(this.newSessionConfigOptions
						? { configOptions: this.newSessionConfigOptions }
						: {}),
					...(this.newSessionModes ? { modes: this.newSessionModes } : {}),
				});
			} else if (
				frame.method === "session/set_config_option" ||
				frame.method === "session/set_mode"
			) {
				if (this.rejectSelections) {
					this.deliver({
						jsonrpc: "2.0",
						id: frame.id,
						error: { code: -32602, message: "mode not allowed" },
					});
				} else if (this.holdSelections) {
					this.heldSelections.push(frame.id as number);
				} else {
					this.respond(frame.id as number, null);
				}
			} else if (frame.method === "session/fork") {
				this.respond(frame.id as number, { sessionId: "sess-forked" });
			} else if (frame.method === "session/load" && this.loadError) {
				this.deliver({ jsonrpc: "2.0", id: frame.id, error: this.loadError });
			} else if (frame.method === "session/load" && this.loadFails) {
				this.deliver({
					jsonrpc: "2.0",
					id: frame.id,
					error: { code: -32002, message: "Resource not found: sess-1" },
				});
			} else if (frame.method === "session/load" && this.replayUpdates) {
				const sessionId = (frame.params as { sessionId: string }).sessionId;
				for (const update of this.replayUpdates) this.notify(sessionId, update);
				this.respond(frame.id as number, null);
			} else if (frame.method === "session/load" && this.wholeMessageReplay) {
				const sessionId = (frame.params as { sessionId: string }).sessionId;
				this.notify(sessionId, {
					sessionUpdate: "user_message",
					messageId: "u1",
					content: [{ type: "text", text: "fix the flaky test" }],
				});
				this.notify(sessionId, {
					sessionUpdate: "agent_message",
					messageId: "a1",
					content: [{ type: "text", text: "On it." }],
				});
				this.respond(frame.id as number, null);
			} else if (frame.method === "session/load" && this.loadConfigOptions) {
				const sessionId = (frame.params as { sessionId: string }).sessionId;
				this.notify(sessionId, {
					sessionUpdate: "config_option_update",
					configOptions: this.loadConfigOptions,
				});
				this.respond(frame.id as number, null);
			} else if (frame.method === "session/load") {
				// A real agent replays the whole transcript — the user's turns
				// included — before it answers.
				const sessionId = (frame.params as { sessionId: string }).sessionId;
				this.notify(sessionId, {
					sessionUpdate: "user_message_chunk",
					content: { type: "text", text: "fix the flaky test" },
				});
				this.notify(sessionId, {
					sessionUpdate: "agent_message_chunk",
					content: { type: "text", text: "On it." },
				});
				this.notify(sessionId, {
					sessionUpdate: "user_message_chunk",
					content: { type: "text", text: "now ship it" },
				});
				this.notify(sessionId, {
					sessionUpdate: "agent_message_chunk",
					content: { type: "text", text: "Shipped." },
				});
				if (this.foreignUpdateDuringLoad) {
					this.notify("other-session", this.foreignUpdateDuringLoad);
				}
				// ACP returns null after replaying history; adapter keeps the id.
				this.respond(frame.id as number, null);
			} else if (frame.method === "_session/steering") {
				this.respond(frame.id as number, { outcome: this.steeringOutcome });
			} else if (frame.method === "session/prompt" && this.holdPrompts) {
				this.heldPrompts.push(frame.id as number);
			} else if (frame.method === "session/prompt") {
				this.notify("sess-1", {
					sessionUpdate: "agent_message_chunk",
					content: { type: "text", text: "Hello" },
				});
				this.notify("sess-1", {
					sessionUpdate: "agent_message_chunk",
					content: { type: "text", text: " world" },
				});
				this.notify("sess-1", {
					sessionUpdate: "tool_call",
					toolCallId: "tc-1",
					title: "Read file",
					kind: "read",
					status: "completed",
					content: [{ type: "content", content: { type: "text", text: "ok" } }],
				});
				this.respond(frame.id as number, { stopReason: "end_turn" });
			}
		});
	}
}

async function collect(
	iterable: AsyncIterable<AdapterEvent>,
	into: AdapterEvent[],
) {
	for await (const event of iterable) into.push(event);
}

async function flush(times = 8): Promise<void> {
	for (let i = 0; i < times; i++) await Promise.resolve();
}

function startAdapter(
	agent: FakeAcpAgent,
	resume?: string,
	selections: { modelId?: string; modeId?: string; cwd?: string } = {},
	adapterOptions: Pick<
		AcpAdapterOptions,
		| "authMethodId"
		| "defaultModeId"
		| "forkPlanReadPermissions"
		| "selectionWaitMs"
		| "backgroundDetailIntervalMs"
		| "startupTimeoutMs"
	> = {},
): { adapter: AcpAdapter; events: AdapterEvent[] } {
	let counter = 0;
	const adapter = new AcpAdapter({
		command: "fake",
		createTransport: (_opts, handlers) => agent.transport(handlers),
		now: () => 1,
		mintId: () => `id-${++counter}`,
		...adapterOptions,
	});
	const events: AdapterEvent[] = [];
	void collect(
		adapter.start({
			cwd: "/work",
			...(resume ? { resume: { harnessSessionId: resume } } : {}),
			...selections,
		}),
		events,
	);
	return { adapter, events };
}

function itemsOf(events: AdapterEvent[]) {
	return events
		.filter((e) => e.kind === "item")
		.map((e) => (e.kind === "item" ? e.item : null))
		.filter((item) => item !== null);
}

function sessionsOf(events: AdapterEvent[]) {
	return events
		.filter((e) => e.kind === "session")
		.map((e) => (e.kind === "session" ? e.session : null))
		.filter((session) => session !== null);
}

function textOf(item: Item | undefined): string {
	return item && "text" in item && typeof item.text === "string"
		? item.text
		: "";
}

describe("AcpAdapter", () => {
	it("bootstraps, streams a turn, and maps items", async () => {
		const agent = new FakeAcpAgent();
		let counter = 0;
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => agent.transport(handlers),
			now: () => 1000,
			mintId: () => `id-${++counter}`,
		});

		const events: AdapterEvent[] = [];
		void collect(adapter.start({ cwd: "/work" }), events);
		await flush();

		adapter.prompt([{ type: "text", text: "hi" }]);
		await flush();

		const sessions = events.filter((e) => e.kind === "session");
		expect(
			sessions.map((e) => (e.kind === "session" ? e.session.status : null)),
		).toContain("idle");

		const items = events
			.filter((e) => e.kind === "item")
			.map((e) => (e.kind === "item" ? e.item : null));
		// The item is re-emitted with full text when the text stream flushes.
		const agentMessages = items.filter((i) => i?.kind === "agent_message");
		const agentMessage = agentMessages[agentMessages.length - 1];
		expect(
			agentMessage && "text" in agentMessage ? agentMessage.text : "",
		).toBe("Hello world");

		const toolCall = items.find((i) => i?.kind === "tool_call");
		expect(toolCall && "toolKind" in toolCall ? toolCall.toolKind : "").toBe(
			"read",
		);

		const textDeltas = events.filter((e) => e.kind === "delta");
		expect(textDeltas.length).toBe(2);

		const turns = events
			.filter((e) => e.kind === "turn")
			.map((e) => (e.kind === "turn" ? e.turn.status : null));
		expect(turns).toContain("running");
		expect(turns).toContain("completed");

		// initialize + session/new + session/prompt all went out.
		expect(agent.sent.map((f) => f.method)).toEqual([
			"initialize",
			"session/new",
			"session/prompt",
		]);

		await adapter.dispose();
	});

	it("steers a prompt into the running turn when the agent advertises it", async () => {
		const agent = new FakeAcpAgent();
		agent.steeringOutcome = "injected";
		agent.holdPrompts = true;
		const { adapter } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "first" }]);
		await flush();

		expect(adapter.canSteer()).toBe(true);
		expect(await adapter.steer([{ type: "text", text: "and this" }])).toBe(
			true,
		);
		expect(agent.sent.at(-1)).toMatchObject({
			method: "_session/steering",
			params: {
				sessionId: "sess-1",
				prompt: [{ type: "text", text: "and this" }],
				_meta: { steering: { idleBehavior: "promptRequired" } },
			},
		});
		await adapter.dispose();
	});

	it("does not steer an agent that does not advertise it", async () => {
		const agent = new FakeAcpAgent();
		agent.holdPrompts = true;
		const { adapter } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "first" }]);
		await flush();

		expect(adapter.canSteer()).toBe(false);
		expect(await adapter.steer([{ type: "text", text: "and this" }])).toBe(
			false,
		);
		expect(agent.sent.map((f) => f.method)).not.toContain("_session/steering");
		await adapter.dispose();
	});

	it("reports a steer the agent hands back as not taken", async () => {
		const agent = new FakeAcpAgent();
		agent.steeringOutcome = "promptRequired";
		agent.holdPrompts = true;
		const { adapter } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "first" }]);
		await flush();

		expect(await adapter.steer([{ type: "text", text: "and this" }])).toBe(
			false,
		);
		await adapter.dispose();
	});

	it("never emits an item with an empty turnId (history replay before any turn)", async () => {
		const agent = new FakeAcpAgent();
		let counter = 0;
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => agent.transport(handlers),
			now: () => 1,
			mintId: () => `id-${++counter}`,
		});
		const events: AdapterEvent[] = [];
		void collect(adapter.start({ cwd: "/work" }), events);
		await flush();

		// Simulate the agent replaying a message with no prompt turn in flight.
		(
			agent as unknown as { deliver: (f: Record<string, unknown>) => void }
		).deliver({
			jsonrpc: "2.0",
			method: "session/update",
			params: {
				sessionId: "sess-1",
				update: {
					sessionUpdate: "agent_message_chunk",
					content: { type: "text", text: "old reply" },
				},
			},
		});
		await flush();

		const itemTurnIds = events
			.filter((e) => e.kind === "item")
			.map((e) => (e.kind === "item" ? e.turnId : ""));
		expect(itemTurnIds.length).toBeGreaterThan(0);
		expect(itemTurnIds.every((id) => id.length > 0)).toBe(true);

		await adapter.dispose();
	});

	it("resumes an existing agent session via session/load", async () => {
		const agent = new FakeAcpAgent();
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => agent.transport(handlers),
			now: () => 1,
			mintId: () => "x",
		});
		const events: AdapterEvent[] = [];
		void collect(
			adapter.start({ cwd: "/work", resume: { harnessSessionId: "sess-1" } }),
			events,
		);
		await flush();

		expect(agent.sent.map((f) => f.method)).toContain("session/load");
		await adapter.dispose();
	});

	it("keeps another session's updates out of a replay", async () => {
		const agent = new FakeAcpAgent();
		agent.foreignUpdateDuringLoad = {
			sessionUpdate: "tool_call",
			toolCallId: "stray-1",
			title: "ls",
			kind: "execute",
			status: "pending",
		};
		const { adapter, events } = startAdapter(agent, "sess-1");
		await flush();

		expect(
			itemsOf(events).some((i) => i.kind === "tool_call" && i.id === "stray-1"),
		).toBe(false);
		await adapter.dispose();
	});

	it("records the replayed transcript, user turns included", async () => {
		const agent = new FakeAcpAgent();
		let counter = 0;
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => agent.transport(handlers),
			now: () => 1,
			mintId: () => `id-${++counter}`,
		});
		const events: AdapterEvent[] = [];
		void collect(
			adapter.start({ cwd: "/work", resume: { harnessSessionId: "sess-1" } }),
			events,
		);
		await flush(40);

		const items = events
			.filter((e) => e.kind === "item")
			.map((e) => (e.kind === "item" ? e.item : null));

		// The first one is the report: it used to be dropped entirely.
		const userMessage = items.find((i) => i?.kind === "user_message");
		expect(
			userMessage && "content" in userMessage ? userMessage.content : [],
		).toEqual([{ type: "text", text: "fix the flaky test" }]);

		// Complete without a later turn to flush it: nothing else is coming.
		const agentMessages = items.filter((i) => i?.kind === "agent_message");
		const agentMessage = agentMessages[agentMessages.length - 1];
		expect(
			agentMessage && "text" in agentMessage ? agentMessage.text : "",
		).toBe("Shipped.");

		await adapter.dispose();
	});

	it("gives each replayed user prompt its own turn, in order", async () => {
		const agent = new FakeAcpAgent();
		let counter = 0;
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => agent.transport(handlers),
			// A replay arrives faster than the clock ticks, so ordering can never
			// lean on the timestamp alone.
			now: () => 1,
			mintId: () => `id-${++counter}`,
		});
		const events: AdapterEvent[] = [];
		void collect(
			adapter.start({ cwd: "/work", resume: { harnessSessionId: "sess-1" } }),
			events,
		);
		await flush(40);

		const text = (item: unknown): string => {
			const i = item as {
				kind: string;
				text?: string;
				content?: Array<{ text?: string }>;
			};
			return i.kind === "user_message"
				? (i.content?.[0]?.text ?? "")
				: (i.text ?? "");
		};
		const items = events
			.filter((e) => e.kind === "item")
			.map((e) =>
				e.kind === "item" ? { turnId: e.turnId, item: e.item } : null,
			)
			.filter((e) => e !== null);

		const turnOf = (wanted: string): string | undefined =>
			items.find((e) => text(e.item) === wanted)?.turnId;

		const firstPrompt = turnOf("fix the flaky test");
		const firstReply = turnOf("On it.");
		const secondPrompt = turnOf("now ship it");
		const secondReply = turnOf("Shipped.");

		// A prompt and the reply it drew belong together...
		expect(firstPrompt).toBe(firstReply);
		expect(secondPrompt).toBe(secondReply);
		// ...and the two exchanges must not collapse into one group, whose order
		// would then be decided by item id.
		expect(firstPrompt).not.toBe(secondPrompt);

		// Within a turn the prompt has to precede the reply it drew. Items that
		// share a millisecond are ordered by item id, and "agent_message" sorts
		// ahead of "user_message", so equal stamps put the answer first.
		const startOf = (wanted: string): number => {
			const hit = items.find((e) => text(e.item) === wanted);
			return (hit?.item as { startedAtMs: number }).startedAtMs;
		};
		expect(startOf("fix the flaky test")).toBeLessThan(startOf("On it."));
		expect(startOf("now ship it")).toBeLessThan(startOf("Shipped."));

		// Turn starts have to separate too, or the groups sort by turn id.
		const starts = events
			.filter((e) => e.kind === "turn")
			.map((e) => (e.kind === "turn" ? e.turn.startedAtMs : 0));
		expect(starts.length).toBe(2);
		expect(starts[1]).toBeGreaterThan(starts[0] as number);

		await adapter.dispose();
	});

	it("opens a new session when there is no transcript to resume", async () => {
		const agent = new FakeAcpAgent();
		agent.loadFails = true;
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => agent.transport(handlers),
			now: () => 1,
			mintId: () => "x",
		});
		const events: AdapterEvent[] = [];
		void collect(
			adapter.start({ cwd: "/work", resume: { harnessSessionId: "sess-1" } }),
			events,
		);
		await flush(40);

		// An agent that was never prompted has nothing to load, so the chat has
		// to open one rather than stall on an error nobody can act on.
		expect(agent.sent.map((f) => f.method)).toEqual([
			"initialize",
			"session/load",
			"session/new",
		]);
		const statuses = events
			.filter((e) => e.kind === "session")
			.map((e) => (e.kind === "session" ? e.session.status : null));
		expect(statuses).toContain("idle");
		expect(statuses).not.toContain("dead");

		// The caller asked for sess-1 and did not get it; it has to be told which
		// session the chat actually ended up on, or its stored id stays dead.
		const bound = events
			.filter((e) => e.kind === "session")
			.map((e) =>
				e.kind === "session" ? e.session.harnessSessionId : undefined,
			)
			.filter((id) => id !== undefined)
			.pop();
		expect(bound).toBe("sess-1");

		// Quietly: an error the reader cannot act on is worse than a plain note.
		const notice = events
			.filter((e) => e.kind === "item")
			.map((e) => (e.kind === "item" ? e.item : null))
			.find((i) => i?.kind === "notice");
		expect(notice && "noticeKind" in notice ? notice.noticeKind : "").toBe(
			"info",
		);

		await adapter.dispose();
	});

	it("asks for the newest protocol version it speaks", async () => {
		const agent = new FakeAcpAgent();
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => agent.transport(handlers),
			now: () => 1,
			mintId: () => "x",
		});
		void collect(adapter.start({ cwd: "/work" }), []);
		await flush();

		const initialize = agent.sent.find((f) => f.method === "initialize");
		expect(
			(initialize?.params as { protocolVersion?: number })?.protocolVersion,
		).toBe(2);

		await adapter.dispose();
	});

	// An agent that only speaks v1 answers 1, and the session has to run on
	// that rather than on what was asked for.
	it("runs on the version the agent answers with", async () => {
		for (const version of [1, 2]) {
			const agent = new FakeAcpAgent();
			agent.protocolVersion = version;
			const adapter = new AcpAdapter({
				command: "fake",
				createTransport: (_opts, handlers) => agent.transport(handlers),
				now: () => 1,
				mintId: () => "x",
			});
			const events: AdapterEvent[] = [];
			void collect(adapter.start({ cwd: "/work" }), events);
			await flush(40);

			// Whatever it settled on, the session still opens and works.
			const statuses = events
				.filter((e) => e.kind === "session")
				.map((e) => (e.kind === "session" ? e.session.status : null));
			expect(statuses).toContain("idle");
			expect(statuses).not.toContain("dead");
			await adapter.dispose();
		}
	});

	it("forks when the agent says it can, and declines when it does not", async () => {
		const forking = new FakeAcpAgent();
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => forking.transport(handlers),
			now: () => 1,
			mintId: () => "x",
		});
		void collect(adapter.start({ cwd: "/work" }), []);
		await flush(40);
		expect(await adapter.fork()).toBe("sess-forked");
		await adapter.dispose();

		// An agent that advertises no fork capability is never asked.
		const plain = new FakeAcpAgent();
		plain.sessionCapabilities = null;
		const second = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => plain.transport(handlers),
			now: () => 1,
			mintId: () => "x",
		});
		void collect(second.start({ cwd: "/work" }), []);
		await flush(40);
		expect(await second.fork()).toBeNull();
		expect(plain.sent.map((f) => f.method)).not.toContain("session/fork");
		await second.dispose();
	});

	it("sends an exact AIR fork point only for adapters configured to support it", async () => {
		for (const supported of [true, false]) {
			const agent = new FakeAcpAgent();
			const adapter = new AcpAdapter({
				command: "fake",
				forkAtMessage: supported,
				createTransport: (_opts, handlers) => agent.transport(handlers),
			});
			const events: AdapterEvent[] = [];
			void collect(adapter.start({ cwd: "/work" }), events);
			await flush(40);
			expect(
				events.some(
					(event) =>
						event.kind === "session" &&
						event.session.forkAtMessage === supported,
				),
			).toBe(true);
			expect(await adapter.fork({ messageId: "native:reply-1" })).toBe(
				supported ? "sess-forked" : null,
			);
			const request = agent.sent.find(
				(frame) => frame.method === "session/fork",
			);
			if (supported)
				expect(request?.params).toEqual({
					sessionId: "sess-1",
					cwd: "/work",
					mcpServers: [],
					_meta: {
						jetbrains: {
							air: { fork: { version: 1, messageId: "native:reply-1" } },
						},
					},
				});
			else expect(request).toBeUndefined();
			await adapter.dispose();
		}
	});

	it("surfaces the agent's own slash commands", async () => {
		const agent = new FakeAcpAgent();
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => agent.transport(handlers),
			now: () => 1,
			mintId: () => "x",
		});
		const events: AdapterEvent[] = [];
		void collect(adapter.start({ cwd: "/work" }), events);
		await flush();

		(
			agent as unknown as { deliver: (f: Record<string, unknown>) => void }
		).deliver({
			jsonrpc: "2.0",
			method: "session/update",
			params: {
				sessionId: "sess-1",
				update: {
					sessionUpdate: "available_commands_update",
					availableCommands: [
						{ name: "review", description: "Review the diff" },
						{
							name: "compact",
							description: "Compact the context",
							_meta: { command_category: "native" },
						},
						{
							name: "mcp:search",
							description: "Search",
							_meta: { command_category: "unknown" },
						},
						{ name: "", description: "dropped: no name" },
					],
				},
			},
		});
		await flush();

		const sessions = events
			.filter((e) => e.kind === "session")
			.map((e) => (e.kind === "session" ? e.session : null));
		const commands = sessions
			.map((s) => s?.availableCommands)
			.filter((c) => c !== undefined)
			.pop();
		expect(commands).toEqual([
			{ name: "review", description: "Review the diff" },
			{
				name: "compact",
				description: "Compact the context",
				category: "native",
			},
			{ name: "mcp:search", description: "Search" },
		]);

		await adapter.dispose();
	});

	it("ignores the user_message_chunk echo of a live prompt", async () => {
		const agent = new FakeAcpAgent();
		let counter = 0;
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => agent.transport(handlers),
			now: () => 1,
			mintId: () => `id-${++counter}`,
		});
		const events: AdapterEvent[] = [];
		void collect(adapter.start({ cwd: "/work" }), events);
		await flush();
		adapter.prompt([{ type: "text", text: "hi" }]);
		await flush();

		(
			agent as unknown as { deliver: (f: Record<string, unknown>) => void }
		).deliver({
			jsonrpc: "2.0",
			method: "session/update",
			params: {
				sessionId: "sess-1",
				update: {
					sessionUpdate: "user_message_chunk",
					content: { type: "text", text: "hi" },
				},
			},
		});
		await flush();

		const userMessages = events
			.filter((e) => e.kind === "item")
			.map((e) => (e.kind === "item" ? e.item : null))
			.filter((i) => i?.kind === "user_message");
		expect(userMessages).toEqual([]);

		await adapter.dispose();
	});

	it("surfaces a permission request and forwards the selected option", async () => {
		const agent = new FakeAcpAgent();
		let counter = 0;
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => agent.transport(handlers),
			now: () => 1,
			mintId: () => `id-${++counter}`,
		});
		const events: AdapterEvent[] = [];
		void collect(adapter.start({ cwd: "/work" }), events);
		await flush();
		adapter.prompt([{ type: "text", text: "run" }]);
		await flush();

		agent.requestPermission("sess-1", "tc-1");
		await flush();

		const approval = events
			.filter((e) => e.kind === "item")
			.map((e) => (e.kind === "item" ? e.item : null))
			.find((i) => i?.kind === "approval_request");
		expect(approval?.id).toBe("approval:tc-1");

		adapter.respondToApproval("approval:tc-1", {
			type: "option",
			optionId: "allow",
		});
		await flush();

		const response = agent.lastPermissionResponse();
		expect(response?.result).toEqual({
			outcome: { outcome: "selected", optionId: "allow" },
		});

		await adapter.dispose();
	});

	it("advertises form elicitation and answers a question form", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		const initialize = agent.sent.find((f) => f.method === "initialize");
		expect(initialize?.params).toMatchObject({
			clientCapabilities: { elicitation: { form: {} } },
			capabilities: { elicitation: { form: {} } },
		});

		const requestId = agent.requestElicitation({
			toolCallId: "tc-ask",
			message: "Which database?",
			requestedSchema: {
				type: "object",
				properties: {
					question_0: {
						type: "string",
						title: "Database",
						oneOf: [
							{ const: "Postgres", title: "Postgres", description: "SQL" },
							{ const: "Redis", title: "Redis" },
						],
					},
					question_0_custom: { type: "string", title: "Other" },
				},
			},
		});
		await flush();

		const approval = itemsOf(events).find((i) => i.kind === "approval_request");
		expect(approval).toMatchObject({
			targetItemId: "tc-ask",
			form: {
				message: "Which database?",
				fields: [
					{
						id: "question_0",
						title: "Database",
						input: "single",
						options: [
							{ value: "Postgres", label: "Postgres", description: "SQL" },
							{ value: "Redis", label: "Redis" },
						],
					},
					{ id: "question_0_custom", title: "Other", input: "text" },
				],
			},
		});

		adapter.respondToApproval(approval?.id ?? "", {
			type: "form",
			values: { question_0: "Redis" },
		});
		await flush();

		expect(agent.responseTo(requestId)?.result).toEqual({
			action: "accept",
			content: { question_0: "Redis" },
		});

		await adapter.dispose();
	});

	it("types a generic form's answers by its schema", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		const requestId = agent.requestElicitation({
			message: "Configure",
			requestedSchema: {
				type: "object",
				required: ["confirm"],
				properties: {
					confirm: { type: "boolean", title: "Confirm" },
					count: { type: "integer" },
					ratio: { type: "number" },
					size: {
						type: "string",
						enum: ["s", "l"],
						enumNames: ["Small", "Large"],
					},
				},
			},
		});
		await flush();

		const approval = itemsOf(events).find((i) => i.kind === "approval_request");
		expect(approval).toMatchObject({
			targetItemId: null,
			form: {
				fields: [
					{ id: "confirm", input: "boolean", required: true },
					{ id: "count", input: "integer" },
					{ id: "ratio", input: "number" },
					{
						id: "size",
						input: "single",
						options: [
							{ value: "s", label: "Small" },
							{ value: "l", label: "Large" },
						],
					},
				],
			},
		});

		adapter.respondToApproval(approval?.id ?? "", {
			type: "form",
			values: { confirm: "true", count: "3", ratio: "2.5", size: "l" },
		});
		await flush();

		expect(agent.responseTo(requestId)?.result).toEqual({
			action: "accept",
			content: { confirm: true, count: 3, ratio: 2.5, size: "l" },
		});

		await adapter.dispose();
	});

	it("keeps a form pending when an answer misses a required field or is not a whole number", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		const requestId = agent.requestElicitation({
			message: "Configure",
			requestedSchema: {
				type: "object",
				required: ["confirm"],
				properties: {
					confirm: { type: "boolean" },
					count: { type: "integer" },
				},
			},
		});
		await flush();
		const approvalId =
			itemsOf(events).find((i) => i.kind === "approval_request")?.id ?? "";

		adapter.respondToApproval(approvalId, {
			type: "form",
			values: { count: "3" },
		});
		adapter.respondToApproval(approvalId, {
			type: "form",
			values: { confirm: "true", count: "3.9" },
		});
		await flush();
		expect(agent.responseTo(requestId)).toBeUndefined();

		adapter.respondToApproval(approvalId, {
			type: "form",
			values: { confirm: "false", count: "4" },
		});
		await flush();
		expect(agent.responseTo(requestId)?.result).toEqual({
			action: "accept",
			content: { confirm: false, count: 4 },
		});

		await adapter.dispose();
	});

	it("answers a form with decline for an allow and cancel for a cancel", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		const allowId = agent.requestElicitation({ message: "First" }, 9002);
		const cancelId = agent.requestElicitation({ message: "Second" }, 9003);
		await flush();

		const [first, second] = itemsOf(events).filter(
			(i) => i.kind === "approval_request",
		);
		adapter.respondToApproval(first?.id ?? "", { type: "accept" });
		adapter.respondToApproval(second?.id ?? "", { type: "cancel" });
		await flush();

		expect(agent.responseTo(allowId)?.result).toEqual({ action: "decline" });
		expect(agent.responseTo(cancelId)?.result).toEqual({ action: "cancel" });

		await adapter.dispose();
	});

	it("rejects a url-mode or malformed elicitation", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		const urlId = agent.requestElicitation(
			{ mode: "url", message: "Sign in", url: "https://example.com" },
			9002,
		);
		const malformedId = agent.requestElicitation({}, 9003);
		await flush();

		expect(agent.responseTo(urlId)?.error).toMatchObject({ code: -32602 });
		expect(agent.responseTo(malformedId)?.error).toMatchObject({
			code: -32602,
		});
		expect(
			itemsOf(events).some((i) => i.kind === "approval_request"),
		).toBeFalse();

		await adapter.dispose();
	});

	it("does not allow a permission request on a form decision", async () => {
		const agent = new FakeAcpAgent();
		const { adapter } = startAdapter(agent);
		await flush();

		agent.requestPermission("sess-1", "tc-1");
		await flush();
		adapter.respondToApproval("approval:tc-1", { type: "form", values: {} });
		await flush();

		expect(agent.lastPermissionResponse()?.result).toEqual({
			outcome: { outcome: "cancelled" },
		});

		await adapter.dispose();
	});

	it("cancels a turn's pending form when the turn ends", async () => {
		const agent = new FakeAcpAgent();
		agent.holdPrompts = true;
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "ask me" }]);
		await flush();

		const requestId = agent.requestElicitation({ message: "Which?" });
		await flush();
		agent.releasePrompts("cancelled");
		await flush();

		const approvals = itemsOf(events).filter(
			(i) => i.kind === "approval_request",
		);
		expect(approvals.at(-1)).toMatchObject({ status: "stale" });
		expect(agent.responseTo(requestId)?.result).toEqual({ action: "cancel" });

		await adapter.dispose();
	});

	it("marks a form stale when the agent cancels its request", async () => {
		const agent = new FakeAcpAgent();
		agent.holdPrompts = true;
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "ask me" }]);
		await flush();

		const requestId = agent.requestElicitation({ message: "Which?" });
		await flush();
		agent.cancelRequest(requestId);
		await flush();

		const approvals = itemsOf(events).filter(
			(i) => i.kind === "approval_request",
		);
		expect(approvals.at(-1)).toMatchObject({ status: "stale" });
		const statuses = events.flatMap((e) =>
			e.kind === "session" && e.session.status ? [e.session.status] : [],
		);
		expect(statuses.at(-1)).toBe("running");

		await adapter.dispose();
	});
});

describe("AcpAdapter on protocol v2", () => {
	// v2 dropped `tool_call`, so the only variant that can open one is the
	// update, and it has to create as well as amend.
	it("creates a tool call from a tool_call_update", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "tc-9",
			name: "Read",
			title: "Read file",
			kind: "read",
			status: "in_progress",
			// v2 sends null for the fields it is not setting, and a null that fails
			// to parse would drop the whole update.
			content: null,
			locations: null,
		});
		await flush();

		const toolCall = itemsOf(events).find((i) => i.kind === "tool_call");
		expect(toolCall?.id).toBe("tc-9");
		expect(toolCall && "toolKind" in toolCall ? toolCall.toolKind : "").toBe(
			"read",
		);
		expect(toolCall && "toolName" in toolCall ? toolCall.toolName : "").toBe(
			"Read",
		);
		expect(toolCall && "status" in toolCall ? toolCall.status : "").toBe(
			"running",
		);

		await adapter.dispose();
	});

	it("names the MCP server and tool of a Claude MCP call, and keeps them across updates", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "tc-mcp",
			title: "mcp__linear__save_issue",
			kind: "other",
			_meta: { claudeCode: { toolName: "mcp__linear__save_issue" } },
		});
		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "tc-mcp",
			status: "completed",
		});
		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "tc-bash",
			title: "ls",
			kind: "execute",
			_meta: { claudeCode: { toolName: "Bash" } },
		});
		await flush();

		const toolCalls = itemsOf(events).filter((i) => i.kind === "tool_call");
		const mcpCalls = toolCalls.filter((i) => i.id === "tc-mcp");
		const last = mcpCalls[mcpCalls.length - 1];
		expect(last && "mcpServer" in last ? last.mcpServer : null).toEqual({
			name: "linear",
			tool: "save_issue",
		});
		expect(last && "toolName" in last ? last.toolName : "").toBe(
			"mcp__linear__save_issue",
		);
		const bash = toolCalls.find((i) => i.id === "tc-bash");
		expect(bash && "mcpServer" in bash ? bash.mcpServer : undefined).toBe(
			undefined,
		);

		await adapter.dispose();
	});

	it("appends tool_call_content_chunk output and keeps it across updates", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "tc-1",
			title: "Run tests",
			kind: "execute",
		});
		for (const text of ["first", "second"]) {
			agent.notify("sess-1", {
				sessionUpdate: "tool_call_content_chunk",
				toolCallId: "tc-1",
				content: { type: "content", content: { type: "text", text } },
			});
		}
		// An update that says nothing about content must not drop what streamed.
		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "tc-1",
			status: "completed",
		});
		await flush();

		const toolCalls = itemsOf(events).filter((i) => i.kind === "tool_call");
		const last = toolCalls[toolCalls.length - 1];
		expect(last && "content" in last ? last.content : []).toEqual([
			{ type: "text", text: "first" },
			{ type: "text", text: "second" },
		]);
		expect(last && "status" in last ? last.status : "").toBe("completed");

		await adapter.dispose();
	});

	it("takes the session state from a state_update", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "state_update",
			state: "requires_action",
		});
		await flush();
		expect(sessionsOf(events).map((s) => s.status)).toContain("awaiting_input");

		agent.notify("sess-1", {
			sessionUpdate: "state_update",
			state: "idle",
			stopReason: "end_turn",
		});
		await flush();
		expect(sessionsOf(events).pop()?.status).toBe("idle");

		// A state v2 reserves for later must not reset the session.
		const before = sessionsOf(events).length;
		agent.notify("sess-1", { sessionUpdate: "state_update", state: "unknown" });
		await flush();
		expect(sessionsOf(events).length).toBe(before);

		await adapter.dispose();
	});

	it("starts in the harness default mode when the client asks for none", async () => {
		const agent = new FakeAcpAgent();
		agent.newSessionConfigOptions = [
			{
				configId: "mode",
				name: "Mode",
				type: "select",
				category: "mode",
				currentValue: "default",
				options: [
					{ value: "default", name: "Ask for approval" },
					{ value: "bypassPermissions", name: "Full access" },
				],
			},
		];
		const { adapter, events } = startAdapter(
			agent,
			undefined,
			{},
			{ defaultModeId: "bypassPermissions" },
		);
		await flush();

		const sent = agent.sent.find(
			(f) => f.method === "session/set_config_option",
		);
		expect(sent?.params).toMatchObject({
			configId: "mode",
			value: "bypassPermissions",
		});
		expect(sessionsOf(events).pop()?.modeId).toBe("bypassPermissions");

		await adapter.dispose();
	});

	it("sets the default mode over session/set_mode on a v1 agent", async () => {
		const agent = new FakeAcpAgent();
		agent.protocolVersion = 1;
		agent.newSessionModes = {
			currentModeId: "default",
			availableModes: [
				{ id: "default", name: "Ask for approval" },
				{ id: "bypassPermissions", name: "Full access" },
			],
		};
		const { adapter, events } = startAdapter(
			agent,
			undefined,
			{},
			{ defaultModeId: "bypassPermissions" },
		);
		await flush();

		const sent = agent.sent.find((f) => f.method === "session/set_mode");
		expect(sent?.params).toEqual({
			sessionId: "sess-1",
			modeId: "bypassPermissions",
		});
		expect(sessionsOf(events).pop()?.modeId).toBe("bypassPermissions");

		await adapter.dispose();
	});

	it("keeps a resumed session's own mode instead of the harness default", async () => {
		const agent = new FakeAcpAgent();
		agent.loadConfigOptions = [
			{
				configId: "mode",
				name: "Mode",
				type: "select",
				category: "mode",
				currentValue: "default",
				options: [
					{ value: "default", name: "Ask for approval" },
					{ value: "bypassPermissions", name: "Full access" },
				],
			},
		];
		const { adapter, events } = startAdapter(
			agent,
			"sess-1",
			{},
			{ defaultModeId: "bypassPermissions" },
		);
		await flush();

		expect(
			agent.sent.some((f) => f.method === "session/set_config_option"),
		).toBe(false);
		expect(
			sessionsOf(events).flatMap((session) =>
				session.modeId ? [session.modeId] : [],
			),
		).toEqual(["default"]);

		await adapter.dispose();
	});

	it("applies the harness default when a resume falls back to a new session", async () => {
		const agent = new FakeAcpAgent();
		agent.loadFails = true;
		agent.newSessionConfigOptions = [
			{
				configId: "mode",
				name: "Mode",
				type: "select",
				category: "mode",
				currentValue: "default",
				options: [
					{ value: "default", name: "Ask for approval" },
					{ value: "bypassPermissions", name: "Full access" },
				],
			},
		];
		const { adapter } = startAdapter(
			agent,
			"sess-gone",
			{},
			{ defaultModeId: "bypassPermissions" },
		);
		await flush(16);

		const sent = agent.sent.find(
			(f) => f.method === "session/set_config_option",
		);
		expect(sent?.params).toMatchObject({ value: "bypassPermissions" });

		await adapter.dispose();
	});

	it("opens in the agent's own mode when asked for the agent default", async () => {
		const agent = new FakeAcpAgent();
		agent.newSessionConfigOptions = [
			{
				configId: "mode",
				name: "Mode",
				type: "select",
				category: "mode",
				currentValue: "default",
				options: [
					{ value: "default", name: "Ask for approval" },
					{ value: "bypassPermissions", name: "Full access" },
				],
			},
		];
		const { adapter } = startAdapter(
			agent,
			undefined,
			{ modeId: AGENT_DEFAULT_MODE },
			{ defaultModeId: "bypassPermissions" },
		);
		await flush();

		expect(agent.sent.map((f) => f.method)).not.toContain(
			"session/set_config_option",
		);

		await adapter.dispose();
	});

	it("holds a prompt until the agent answers the start mode", async () => {
		const agent = new FakeAcpAgent();
		agent.holdSelections = true;
		agent.newSessionConfigOptions = [
			{
				configId: "mode",
				name: "Mode",
				type: "select",
				category: "mode",
				currentValue: "default",
				options: [
					{ value: "default", name: "Ask for approval" },
					{ value: "bypassPermissions", name: "Full access" },
				],
			},
		];
		const { adapter } = startAdapter(
			agent,
			undefined,
			{},
			{ defaultModeId: "bypassPermissions" },
		);
		adapter.prompt([{ type: "text", text: "go" }]);
		await flush(16);

		const methods = () => agent.sent.map((f) => f.method);
		expect(methods()).toContain("session/set_config_option");
		expect(methods()).not.toContain("session/prompt");

		agent.releaseSelections();
		await flush(16);
		expect(methods().indexOf("session/prompt")).toBeGreaterThan(
			methods().indexOf("session/set_config_option"),
		);

		await adapter.dispose();
	});

	it("puts the mode back when the agent rejects a change", async () => {
		const agent = new FakeAcpAgent();
		agent.newSessionConfigOptions = [
			{
				configId: "mode",
				name: "Mode",
				type: "select",
				category: "mode",
				currentValue: "bypassPermissions",
				options: [
					{ value: "default", name: "Ask for approval" },
					{ value: "bypassPermissions", name: "Full access" },
				],
			},
		];
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.rejectSelections = true;
		adapter.setMode("default");
		await flush();

		expect(sessionsOf(events).pop()?.modeId).toBe("bypassPermissions");
		expect(
			itemsOf(events).some(
				(item) => item.kind === "notice" && item.noticeKind === "error",
			),
		).toBe(true);

		await adapter.dispose();
	});

	it("says so when a prompt goes out before a change is confirmed", async () => {
		const agent = new FakeAcpAgent();
		agent.holdSelections = true;
		agent.newSessionConfigOptions = [
			{
				configId: "mode",
				name: "Mode",
				type: "select",
				category: "mode",
				currentValue: "default",
				options: [
					{ value: "default", name: "Ask for approval" },
					{ value: "bypassPermissions", name: "Full access" },
				],
			},
		];
		const { adapter, events } = startAdapter(
			agent,
			undefined,
			{},
			{ defaultModeId: "bypassPermissions", selectionWaitMs: 5 },
		);
		adapter.prompt([{ type: "text", text: "go" }]);
		await Bun.sleep(20);
		await flush();

		expect(agent.sent.map((f) => f.method)).toContain("session/prompt");
		expect(
			itemsOf(events).some(
				(item) =>
					item.kind === "notice" &&
					typeof item.text === "string" &&
					item.text.includes("did not confirm a mode or model change"),
			),
		).toBe(true);

		await adapter.dispose();
	});

	it("lets a requested start mode win over the harness default", async () => {
		const agent = new FakeAcpAgent();
		agent.newSessionConfigOptions = [
			{
				configId: "mode",
				name: "Mode",
				type: "select",
				category: "mode",
				currentValue: "default",
				options: [
					{ value: "default", name: "Ask for approval" },
					{ value: "acceptEdits", name: "Approve edits" },
					{ value: "bypassPermissions", name: "Full access" },
				],
			},
		];
		const { adapter } = startAdapter(
			agent,
			undefined,
			{ modeId: "acceptEdits" },
			{ defaultModeId: "bypassPermissions" },
		);
		await flush();

		const sent = agent.sent.filter(
			(f) => f.method === "session/set_config_option",
		);
		expect(sent.map((f) => (f.params as { value: string }).value)).toEqual([
			"acceptEdits",
		]);

		await adapter.dispose();
	});

	// v2 has no modes at all: the mode is a `select` config option, and
	// `session/set_config_option` replaces `session/set_mode`.
	it("takes the mode from a config_option_update and sets it back", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "config_option_update",
			configOptions: [
				{
					configId: "model",
					name: "Model",
					type: "select",
					category: "model",
					currentValue: "opus",
					options: [{ value: "opus", name: "Opus" }],
				},
				{
					configId: "mode",
					name: "Mode",
					type: "select",
					category: "mode",
					currentValue: "plan",
					options: [
						{ value: "plan", name: "Plan" },
						{ value: "code", name: "Code" },
					],
				},
			],
		});
		await flush();

		const session = sessionsOf(events).pop();
		expect(session?.modeId).toBe("plan");
		expect(session?.availableModes).toEqual([
			{ id: "plan", label: "Plan" },
			{ id: "code", label: "Code" },
			{ id: FULL_ACCESS_CHAT_MODE, label: "Full access" },
		]);

		adapter.setMode("code");
		await flush();
		const sent = agent.sent.find(
			(f) => f.method === "session/set_config_option",
		);
		expect(sent?.params).toEqual({
			sessionId: "sess-1",
			configId: "mode",
			type: "id",
			value: "code",
		});
		expect(agent.sent.map((f) => f.method)).not.toContain("session/set_mode");

		await adapter.dispose();
	});

	it("lists a background task from its spawn until it ends", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "async_task_spawned",
			asyncTaskId: "task-1",
			name: "bun run dev",
			canStop: true,
		});
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "async_task_state_update",
			asyncTaskId: "task-1",
			state: "completed",
		});
		await flush();

		const lists = events.flatMap((event) =>
			event.kind === "session" && event.session.backgroundTasks
				? [event.session.backgroundTasks.map((task) => task.name)]
				: [],
		);
		expect(lists).toEqual([["bun run dev"], []]);

		await adapter.dispose();
	});

	it("ends a subagent's background task with the subagent", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "subagent_spawned",
			subagentSessionId: "child-1",
			name: "Wait",
		});
		agent.notify("child-1", {
			sessionUpdate: "async_task_spawned",
			asyncTaskId: "task-1",
			name: "sleep 120",
			canStop: true,
		});
		agent.notify("sess-1", {
			sessionUpdate: "async_task_spawned",
			asyncTaskId: "task-2",
			name: "bun run dev",
			canStop: true,
		});
		agent.notify("sess-1", {
			sessionUpdate: "subagent_state_update",
			subagentSessionId: "child-1",
			state: "completed",
		});
		await flush();

		const lists = events.flatMap((event) =>
			event.kind === "session" && event.session.backgroundTasks
				? [event.session.backgroundTasks.map((task) => task.name)]
				: [],
		);
		expect(lists.at(-1)).toEqual(["bun run dev"]);

		agent.notify("child-1", {
			sessionUpdate: "async_task_spawned",
			asyncTaskId: "task-3",
			name: "late",
			canStop: true,
		});
		await flush();
		const names = events.flatMap((event) =>
			event.kind === "session" && event.session.backgroundTasks
				? event.session.backgroundTasks.map((task) => task.name)
				: [],
		);
		expect(names).not.toContain("late");

		await adapter.dispose();
	});

	it("reports a running turn as awaiting background work once the agent's cycle ends", async () => {
		const agent = new FakeAcpAgent();
		agent.steeringOutcome = "injected";
		agent.holdPrompts = true;
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "spawn a helper" }]);
		await flush();
		const awaiting = () =>
			sessionsOf(events)
				.filter((session) => session.awaitingBackground !== undefined)
				.map((session) => session.awaitingBackground);

		agent.notify("sess-1", {
			sessionUpdate: "subagent_spawned",
			subagentSessionId: "child-1",
			name: "Helper",
			task: "Help",
		});
		agent.notify("sess-1", {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "Launched." },
		});
		await flush();
		expect(awaiting()).toEqual([]);

		agent.notify("sess-1", {
			sessionUpdate: "usage_update",
			used: 10,
			size: 100,
			cost: { amount: 0.01, currency: "USD" },
		});
		await flush();
		expect(awaiting()).toEqual([true]);

		agent.notify("sess-1", {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "Answering you." },
		});
		await flush();
		expect(awaiting()).toEqual([true, false]);

		await adapter.dispose();
	});

	it("records a reply in full when the agent's cycle ends, not when the next item starts", async () => {
		const agent = new FakeAcpAgent();
		agent.holdPrompts = true;
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "say hi" }]);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "Hello " },
		});
		agent.notify("sess-1", {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "there." },
		});
		agent.notify("sess-1", {
			sessionUpdate: "usage_update",
			used: 10,
			size: 100,
			cost: { amount: 0.01, currency: "USD" },
		});
		await flush();

		const recorded = events.flatMap((event) =>
			event.kind === "item" && event.item.kind === "agent_message"
				? [(event.item as { text: string }).text]
				: [],
		);
		expect(recorded.at(-1)).toBe("Hello there.");
		await adapter.dispose();
	});

	it("treats a steered turn as working until the steered reply streams", async () => {
		const agent = new FakeAcpAgent();
		agent.steeringOutcome = "injected";
		agent.holdPrompts = true;
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "spawn a helper" }]);
		await flush();
		const awaiting = () =>
			sessionsOf(events)
				.filter((session) => session.awaitingBackground !== undefined)
				.map((session) => session.awaitingBackground);
		const cycleEnds = () =>
			agent.notify("sess-1", {
				sessionUpdate: "usage_update",
				used: 10,
				size: 100,
				cost: { amount: 0.01, currency: "USD" },
			});
		agent.notify("sess-1", {
			sessionUpdate: "subagent_spawned",
			subagentSessionId: "child-1",
			name: "Helper",
			task: "Help",
		});
		cycleEnds();
		await flush();
		expect(awaiting()).toEqual([true]);

		await adapter.steer([{ type: "text", text: "and this" }]);
		expect(awaiting()).toEqual([true, false]);

		cycleEnds();
		await flush();
		expect(awaiting()).toEqual([true, false]);

		agent.notify("sess-1", {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "Answer." },
		});
		cycleEnds();
		await flush();
		expect(awaiting()).toEqual([true, false, true]);

		await adapter.dispose();
	});

	it("does not count a background task left over from an earlier turn", async () => {
		const agent = new FakeAcpAgent();
		agent.steeringOutcome = "injected";
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "start the dev server" }]);
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "async_task_spawned",
			asyncTaskId: "task-1",
			name: "bun run dev",
			canStop: true,
		});
		await flush();

		agent.holdPrompts = true;
		adapter.prompt([{ type: "text", text: "now something else" }]);
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "usage_update",
			used: 10,
			size: 100,
			cost: { amount: 0.01, currency: "USD" },
		});
		await flush();

		expect(
			sessionsOf(events).some((session) => session.awaitingBackground),
		).toBe(false);
		await adapter.dispose();
	});

	it("never reports awaiting background work for an agent that cannot steer", async () => {
		const agent = new FakeAcpAgent();
		agent.holdPrompts = true;
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "spawn a helper" }]);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "subagent_spawned",
			subagentSessionId: "child-1",
			name: "Helper",
			task: "Help",
		});
		agent.notify("sess-1", {
			sessionUpdate: "usage_update",
			used: 10,
			size: 100,
			cost: { amount: 0.01, currency: "USD" },
		});
		await flush();

		expect(
			sessionsOf(events).some((session) => session.awaitingBackground),
		).toBe(false);
		await adapter.dispose();
	});

	it("shows a subagent from its spawn until its state ends, keeping its session out of the transcript", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(
			agent,
			undefined,
			{},
			{
				backgroundDetailIntervalMs: 0,
			},
		);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "subagent_spawned",
			subagentSessionId: "child-1",
			name: "Count files",
			task: "Count the files",
		});
		agent.notify("child-1", {
			sessionUpdate: "tool_call",
			toolCallId: "bash-1",
			title: "find . | wc -l",
			kind: "execute",
			status: "pending",
		});
		agent.notify("sess-1", {
			sessionUpdate: "subagent_state_update",
			subagentSessionId: "child-1",
			state: "completed",
		});
		await flush();

		const toolCalls = itemsOf(events).filter((i) => i.kind === "tool_call");
		expect(toolCalls.map((i) => i.id)).not.toContain("bash-1");
		expect(toolCalls.at(-1)).toMatchObject({
			title: "Count files",
			subagent: true,
			status: "completed",
		});
		const lists = events.flatMap((event) =>
			event.kind === "session" && event.session.backgroundTasks
				? [
						event.session.backgroundTasks.map(
							(task) => `${task.kind}:${task.name}`,
						),
					]
				: [],
		);
		expect(lists).toEqual([["subagent:Count files"], []]);
		const steps = events.flatMap((event) =>
			event.kind === "delta" && event.delta.type === "background"
				? [event.delta]
				: [],
		);
		expect(steps).toEqual([
			{
				type: "background",
				itemId: "subagent:child-1",
				append: "find . | wc -l",
			},
		]);

		await adapter.dispose();
	});

	it("drops a parent update for a subagent call it never opened, but keeps an untitled new call", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "agent-1",
			status: "completed",
			_meta: { claudeCode: { toolName: "Agent" } },
		});
		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "read-1",
			kind: "read",
			status: "in_progress",
		});
		await flush();

		const ids = itemsOf(events)
			.filter((i) => i.kind === "tool_call")
			.map((i) => i.id);
		expect(ids).not.toContain("agent-1");
		expect(ids).toContain("read-1");

		await adapter.dispose();
	});

	it("fails running subagents when the agent process exits", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "subagent_spawned",
			subagentSessionId: "child-1",
			name: "Review",
		});
		await flush();
		agent.exit(1);
		await flush();

		const statuses = itemsOf(events).flatMap((i) =>
			i.kind === "tool_call" && i.subagent === true ? [i.status] : [],
		);
		expect(statuses).toEqual(["running", "failed"]);

		await adapter.dispose();
	});

	it("takes the chat title only from its own session", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("child-1", {
			sessionUpdate: "session_info_update",
			title: "Count files",
		});
		agent.notify("sess-1", {
			sessionUpdate: "session_info_update",
			title: "Fix the docs",
		});
		await flush();

		const titles = events.flatMap((event) =>
			event.kind === "session" && event.session.title
				? [event.session.title]
				: [],
		);
		expect(titles).toEqual(["Fix the docs"]);

		await adapter.dispose();
	});

	it("shows a failed subagent spawn the parent never opened", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "tool_call",
			toolCallId: "agent-1",
			title: "Agent",
			status: "failed",
			_meta: { claudeCode: { toolName: "Agent" } },
		});
		await flush();

		expect(
			itemsOf(events).some((i) => i.kind === "tool_call" && i.id === "agent-1"),
		).toBe(true);

		await adapter.dispose();
	});

	it("keeps a finished subagent finished when a late spawn arrives", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		const spawn = {
			sessionUpdate: "subagent_spawned",
			subagentSessionId: "child-1",
			name: "Review",
		};
		agent.notify("sess-1", spawn);
		agent.notify("sess-1", {
			sessionUpdate: "subagent_state_update",
			subagentSessionId: "child-1",
			state: "completed",
		});
		agent.notify("sess-1", spawn);
		await flush();

		const statuses = itemsOf(events).flatMap((i) =>
			i.kind === "tool_call" && i.subagent === true ? [i.status] : [],
		);
		expect(statuses).toEqual(["running", "completed"]);

		await adapter.dispose();
	});

	it("keeps updates from a session it does not track out of the transcript", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("other-session", {
			sessionUpdate: "tool_call",
			toolCallId: "stray-1",
			title: "ls",
			kind: "execute",
			status: "pending",
		});
		await flush();

		expect(
			itemsOf(events).some((i) => i.kind === "tool_call" && i.id === "stray-1"),
		).toBe(false);

		await adapter.dispose();
	});

	it("shows a disconnected subagent as failed", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "subagent_spawned",
			subagentSessionId: "child-1",
			name: "Review",
		});
		agent.notify("sess-1", {
			sessionUpdate: "subagent_state_update",
			subagentSessionId: "child-1",
			state: "disconnected",
		});
		await flush();

		const statuses = itemsOf(events).flatMap((i) =>
			i.kind === "tool_call" && i.subagent === true ? [i.status] : [],
		);
		expect(statuses).toEqual(["running", "failed"]);
		await adapter.dispose();
	});

	it("refuses to stop a task it does not know", async () => {
		const agent = new FakeAcpAgent();
		const { adapter } = startAdapter(agent);
		await flush();

		expect(await adapter.stopBackgroundTask("unknown")).toBe(false);
		expect(agent.sent.map((f) => f.method)).not.toContain(
			"_session/async_task/stop",
		);
		await adapter.dispose();
	});

	it("folds a v2 subagent_update into the same lifecycle", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "subagent_update",
			sessionId: "child-1",
			title: "Test runner",
		});
		agent.notify("sess-1", {
			sessionUpdate: "subagent_update",
			sessionId: "child-1",
			state: { state: "completed" },
		});
		await flush();

		const statuses = itemsOf(events).flatMap((i) =>
			i.kind === "tool_call" && i.subagent === true ? [i.status] : [],
		);
		expect(statuses).toEqual(["running", "completed"]);

		await adapter.dispose();
	});

	it("patches the streamed message a whole agent_message names", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "agent_message_chunk",
			messageId: "m1",
			content: { type: "text", text: "Partial" },
		});
		agent.notify("sess-1", {
			sessionUpdate: "agent_message",
			messageId: "m1",
			content: [{ type: "text", text: "Final answer" }],
		});
		await flush();

		const messages = itemsOf(events).filter((i) => i.kind === "agent_message");
		// The whole message replaces what streamed rather than landing beside it.
		expect(new Set(messages.map((i) => i.id)).size).toBe(1);
		expect(textOf(messages[messages.length - 1])).toBe("Final answer");

		// A new message id starts a new item.
		agent.notify("sess-1", {
			sessionUpdate: "agent_message_chunk",
			messageId: "m2",
			content: { type: "text", text: "Next" },
		});
		await flush();
		const ids = new Set(
			itemsOf(events)
				.filter((i) => i.kind === "agent_message")
				.map((i) => i.id),
		);
		expect(ids.size).toBe(2);

		await adapter.dispose();
	});

	it("ignores a whole user_message echoed live", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "hi" }]);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "user_message",
			messageId: "u1",
			content: [{ type: "text", text: "hi" }],
		});
		await flush();

		expect(itemsOf(events).filter((i) => i.kind === "user_message")).toEqual(
			[],
		);

		await adapter.dispose();
	});

	it("records whole messages replayed by session/load", async () => {
		const agent = new FakeAcpAgent();
		agent.wholeMessageReplay = true;
		const { adapter, events } = startAdapter(agent, "sess-1");
		await flush(40);

		const items = itemsOf(events);
		const userMessage = items.find((i) => i.kind === "user_message");
		expect(
			userMessage && "content" in userMessage ? userMessage.content : [],
		).toEqual([{ type: "text", text: "fix the flaky test" }]);
		const agentMessages = items.filter((i) => i.kind === "agent_message");
		expect(textOf(agentMessages[agentMessages.length - 1])).toBe("On it.");

		await adapter.dispose();
	});

	it("maps a plan_update's entries", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "plan_update",
			plan: {
				type: "items",
				planId: "p1",
				entries: [
					{ content: "Read the code", priority: "high", status: "completed" },
					{ content: "Fix it", priority: "high", status: "in_progress" },
				],
			},
		});
		await flush();

		const plan = itemsOf(events).find((i) => i.kind === "plan");
		expect(plan && "entries" in plan ? plan.entries : []).toEqual([
			{ text: "Read the code", status: "completed" },
			{ text: "Fix it", status: "in_progress" },
		]);

		await adapter.dispose();
	});

	it("advertises the client info v2 requires in initialize", async () => {
		const agent = new FakeAcpAgent();
		const { adapter } = startAdapter(agent);
		await flush();

		const initialize = agent.sent.find((f) => f.method === "initialize");
		const params = initialize?.params as {
			protocolVersion?: number;
			info?: { name?: string; version?: string };
			capabilities?: unknown;
			clientCapabilities?: unknown;
		};
		expect(params.protocolVersion).toBe(2);
		expect(params.info?.name).toBe("superset");
		expect(params.info?.version).toBeString();
		// v2 renamed the field; v1 agents still read the old name.
		expect(params.capabilities).toEqual({
			elicitation: { form: {} },
			_meta: AIR_CLIENT_META,
		});
		expect(params.clientCapabilities).toBeDefined();

		await adapter.dispose();
	});

	// A v1 agent must not be handed v2 methods.
	it("still sets the mode with session/set_mode on v1", async () => {
		const agent = new FakeAcpAgent();
		agent.protocolVersion = 1;
		const { adapter } = startAdapter(agent);
		await flush();

		adapter.setMode("plan");
		await flush();

		const sent = agent.sent.find((f) => f.method === "session/set_mode");
		expect(sent?.params).toEqual({ sessionId: "sess-1", modeId: "plan" });
		expect(agent.sent.map((f) => f.method)).not.toContain(
			"session/set_config_option",
		);

		await adapter.dispose();
	});
});

describe("AcpAdapter config options", () => {
	const MODEL_OPTION = {
		id: "model",
		name: "Model",
		type: "select",
		category: "model",
		currentValue: "opus",
		options: [
			{ value: "opus", name: "Opus", description: "For complex work" },
			{ value: "sonnet", name: "Sonnet" },
		],
	};
	const EFFORT_OPTION = {
		id: "effort",
		name: "Effort",
		type: "select",
		category: "thought_level",
		currentValue: "high",
		options: [
			{ value: "low", name: "Low" },
			{ value: "high", name: "High" },
		],
	};

	it("reads the options session/new returns, keyed by v1's id", async () => {
		const agent = new FakeAcpAgent();
		agent.protocolVersion = 1;
		agent.newSessionConfigOptions = [MODEL_OPTION, EFFORT_OPTION];
		const { adapter, events } = startAdapter(agent);
		await flush();

		expect(sessionsOf(events).pop()?.configOptions).toEqual([
			{
				id: "model",
				label: "Model",
				category: "model",
				currentValue: "opus",
				options: [
					{ id: "opus", label: "Opus", description: "For complex work" },
					{ id: "sonnet", label: "Sonnet" },
				],
			},
			{
				id: "effort",
				label: "Effort",
				category: "thought_level",
				currentValue: "high",
				options: [
					{ id: "low", label: "Low" },
					{ id: "high", label: "High" },
				],
			},
		]);

		await adapter.dispose();
	});

	it("sets an option and shows the new value before the agent answers", async () => {
		const agent = new FakeAcpAgent();
		agent.protocolVersion = 1;
		agent.newSessionConfigOptions = [MODEL_OPTION];
		const { adapter, events } = startAdapter(agent);
		await flush();

		adapter.setConfigOption("model", "sonnet");
		await flush();

		expect(sessionsOf(events).pop()?.configOptions?.[0]?.currentValue).toBe(
			"sonnet",
		);
		const sent = agent.sent.find(
			(f) => f.method === "session/set_config_option",
		);
		expect(sent?.params).toEqual({
			sessionId: "sess-1",
			configId: "model",
			value: "sonnet",
		});

		await adapter.dispose();
	});

	it("applies the model it was started with", async () => {
		const agent = new FakeAcpAgent();
		agent.protocolVersion = 1;
		agent.newSessionConfigOptions = [MODEL_OPTION];
		const { adapter } = startAdapter(agent, undefined, { modelId: "sonnet" });
		await flush();

		const sent = agent.sent.find(
			(f) => f.method === "session/set_config_option",
		);
		expect(sent?.params).toEqual({
			sessionId: "sess-1",
			configId: "model",
			value: "sonnet",
		});

		await adapter.dispose();
	});

	it("leaves the model alone when the start model is not offered", async () => {
		const agent = new FakeAcpAgent();
		agent.protocolVersion = 1;
		agent.newSessionConfigOptions = [MODEL_OPTION];
		const { adapter } = startAdapter(agent, undefined, { modelId: "gpt-5.4" });
		await flush();

		expect(agent.sent.map((f) => f.method)).not.toContain(
			"session/set_config_option",
		);

		await adapter.dispose();
	});
});

describe("AcpAdapter attachments", () => {
	const startWith = (
		agent: FakeAcpAgent,
		resolveAttachment: (id: string) => Promise<{
			path: string;
			mimeType: string;
			data: string;
		} | null>,
	) => {
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => agent.transport(handlers),
			resolveAttachment,
			now: () => 1,
			mintId: () => "id-1",
		});
		const events: AdapterEvent[] = [];
		void collect(adapter.start({ cwd: "/work" }), events);
		return { adapter, events };
	};

	const promptBlocks = (agent: FakeAcpAgent): unknown[] =>
		((
			agent.sent.find((f) => f.method === "session/prompt")?.params as {
				prompt?: unknown[];
			}
		)?.prompt ?? []) as unknown[];

	it("sends an image as content when the agent reads images", async () => {
		const agent = new FakeAcpAgent();
		const { adapter } = startWith(agent, async () => ({
			path: "/tmp/shot.png",
			mimeType: "image/png",
			data: "YmFzZTY0",
		}));
		await flush();
		adapter.prompt([
			{ type: "text", text: "what is this" },
			{
				type: "attachment",
				attachmentId: "a1",
				name: "shot.png",
				mimeType: "image/png",
			},
		]);
		await flush();
		expect(promptBlocks(agent)).toEqual([
			{ type: "text", text: "what is this" },
			{ type: "image", mimeType: "image/png", data: "YmFzZTY0" },
		]);
	});

	it("links a non-image so the agent can open it itself", async () => {
		const agent = new FakeAcpAgent();
		const { adapter } = startWith(agent, async () => ({
			path: "/tmp/notes.md",
			mimeType: "text/markdown",
			data: "ZG9j",
		}));
		await flush();
		adapter.prompt([
			{
				type: "attachment",
				attachmentId: "a2",
				name: "notes.md",
				mimeType: "text/markdown",
			},
		]);
		await flush();
		expect(promptBlocks(agent)).toEqual([
			{
				type: "resource_link",
				uri: "file:///tmp/notes.md",
				name: "notes.md",
				mimeType: "text/markdown",
			},
		]);
	});

	it("names an attachment it could not read", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startWith(agent, async () => null);
		await flush();
		adapter.prompt([
			{
				type: "attachment",
				attachmentId: "gone",
				name: "missing.png",
				mimeType: "image/png",
			},
		]);
		await flush();
		expect(promptBlocks(agent)).toEqual([]);
		const told = events.some(
			(e) =>
				e.kind === "item" &&
				"text" in e.item &&
				/missing\.png/.test(String(e.item.text)),
		);
		expect(told).toBe(true);
	});
});

describe("AcpAdapter images", () => {
	const PNG_HEADER = new Uint8Array(24);
	PNG_HEADER.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	new DataView(PNG_HEADER.buffer).setUint32(16, 640);
	new DataView(PNG_HEADER.buffer).setUint32(20, 480);
	const PNG_BASE64 = Buffer.from(PNG_HEADER).toString("base64");

	const startWithStore = (
		agent: FakeAcpAgent,
		storeImage: AcpAdapterOptions["storeImage"],
		resume?: { harnessSessionId: string },
	) => {
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => agent.transport(handlers),
			...(storeImage ? { storeImage } : {}),
			now: () => 1,
			mintId: () => "id-1",
		});
		const events: AdapterEvent[] = [];
		void collect(
			adapter.start({ cwd: "/work", ...(resume ? { resume } : {}) }),
			events,
		);
		return { adapter, events };
	};

	const lastToolCall = (events: AdapterEvent[]) => {
		const calls = itemsOf(events).filter((item) => item.kind === "tool_call");
		return calls[calls.length - 1] as
			| Extract<Item, { kind: "tool_call" }>
			| undefined;
	};

	const lastAgentMessage = (events: AdapterEvent[]) => {
		const messages = itemsOf(events).filter(
			(item) => item.kind === "agent_message",
		);
		return messages[messages.length - 1] as
			| Extract<Item, { kind: "agent_message" }>
			| undefined;
	};

	it("keeps an image block from a tool result as a stored attachment, never its bytes", async () => {
		const agent = new FakeAcpAgent();
		const stored: Array<{ source: AcpImageSource; cwd: string }> = [];
		const { adapter, events } = startWithStore(agent, (source, cwd) => {
			stored.push({ source, cwd });
			return { path: ".superset/attachments/shot-abc123.png" };
		});
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "tc-img",
			title: "Read shot.png",
			kind: "read",
			status: "completed",
			content: [
				{ type: "content", content: { type: "text", text: "Read 1 image" } },
				{
					type: "content",
					content: { type: "image", data: PNG_BASE64, mimeType: "image/png" },
				},
			],
		});
		await flush();

		expect(stored).toHaveLength(1);
		expect(stored[0]?.cwd).toBe("/work");
		expect(stored[0]?.source.kind).toBe("bytes");
		const call = lastToolCall(events);
		expect(call?.content).toEqual([{ type: "text", text: "Read 1 image" }]);
		expect(call?.attachments).toEqual([
			{
				type: "image",
				path: ".superset/attachments/shot-abc123.png",
				mimeType: "image/png",
				width: 640,
				height: 480,
			},
		]);
		expect(JSON.stringify(call)).not.toContain(PNG_BASE64);

		await adapter.dispose();
	});

	it.each([
		"file:///tmp/shots/home.png",
		"file://localhost/tmp/shots/home.png",
		"/tmp/shots/home.png",
	])("keeps linked image %s across later updates", async (uri) => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startWithStore(agent, (source) =>
			source.kind === "file"
				? { path: ".superset/attachments/home-def456.png" }
				: null,
		);
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "tc-link",
			title: "Capture home page",
			kind: "other",
			content: [
				{
					type: "content",
					content: {
						type: "resource_link",
						uri,
						name: "home.png",
						mimeType: "image/png",
					},
				},
			],
		});
		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "tc-link",
			status: "completed",
		});
		await flush();

		const call = lastToolCall(events);
		expect(call?.status).toBe("completed");
		expect(call?.attachments).toEqual([
			{
				type: "image",
				path: ".superset/attachments/home-def456.png",
				mimeType: "image/png",
				alt: "home.png",
			},
		]);

		await adapter.dispose();
	});

	it("gives linked tool and message images stable storage references during session replay", async () => {
		const content = { type: "resource_link", uri: "file:///tmp/shot.png" };
		const updates = [
			{
				sessionUpdate: "tool_call_update",
				toolCallId: "read-1",
				content: [{ type: "content", content }],
			},
			{ sessionUpdate: "agent_message_chunk", messageId: "message-1", content },
			{
				sessionUpdate: "agent_message",
				messageId: "message-1",
				content: [content],
			},
			{ sessionUpdate: "agent_message_chunk", content },
		];
		const references: AcpImageStoreContext[] = [];
		const storeImage: NonNullable<AcpAdapterOptions["storeImage"]> = (
			_source,
			_cwd,
			context,
		) => {
			if (context) references.push(context);
			return { path: ".superset/attachments/shot.png" };
		};
		const agent = new FakeAcpAgent();
		const live = startWithStore(agent, storeImage);
		await flush();
		for (const update of updates) agent.notify("sess-1", update);
		await flush();
		await live.adapter.dispose();
		const liveReferences = references.splice(0);
		const resumedAgent = new FakeAcpAgent();
		resumedAgent.replayUpdates = updates;
		const resumed = startWithStore(resumedAgent, storeImage, {
			harnessSessionId: "sess-1",
		});
		await flush();
		expect(liveReferences.map((context) => context?.referenceId)).toEqual([
			"tool:read-1",
			"message:message-1",
			"message:message-1",
			"image:0",
		]);
		expect(references).toEqual(
			liveReferences.map((context) => ({ ...context, replaying: true })),
		);
		expect(references.every((context) => context?.sessionId === "sess-1")).toBe(
			true,
		);
		await resumed.adapter.dispose();
	});

	it("keeps an image block streamed inside an agent message", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startWithStore(agent, () => ({
			path: ".superset/attachments/inline-789.png",
		}));
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "Here it is:" },
		});
		agent.notify("sess-1", {
			sessionUpdate: "agent_message_chunk",
			content: { type: "image", data: PNG_BASE64, mimeType: "image/png" },
		});
		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "tc-after",
			title: "Next",
			kind: "other",
		});
		await flush();

		const message = lastAgentMessage(events);
		expect(message?.text).toBe("Here it is:");
		expect(message?.completedAtMs).toBeDefined();
		expect(message?.attachments).toEqual([
			{
				type: "image",
				path: ".superset/attachments/inline-789.png",
				mimeType: "image/png",
				width: 640,
				height: 480,
			},
		]);

		await adapter.dispose();
	});

	it("keeps an image from a whole agent message, which is how a replay delivers one", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startWithStore(agent, () => ({
			path: ".superset/attachments/whole-012.png",
		}));
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "agent_message",
			messageId: "a9",
			content: [
				{ type: "text", text: "Done." },
				{ type: "image", data: PNG_BASE64, mimeType: "image/png" },
			],
		});
		await flush();

		const message = lastAgentMessage(events);
		expect(message?.text).toBe("Done.");
		expect(message?.attachments?.map((entry) => entry.type)).toEqual(["image"]);

		await adapter.dispose();
	});

	it("empties inline image payloads a tool result repeats in its raw output", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startWithStore(agent, () => ({
			path: ".superset/attachments/raw-345.png",
		}));
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "tc-raw",
			title: "Read shot.png",
			kind: "read",
			status: "completed",
			content: [
				{
					type: "content",
					content: { type: "image", data: PNG_BASE64, mimeType: "image/png" },
				},
			],
			rawOutput: [
				{
					type: "image",
					data: PNG_BASE64,
					source: {
						type: "base64",
						media_type: "image/png",
						data: PNG_BASE64,
					},
				},
			],
		});
		await flush();

		const call = lastToolCall(events);
		expect(call?.rawOutput).toEqual([
			{
				type: "image",
				data: "",
				source: { type: "base64", media_type: "image/png", data: "" },
			},
		]);
		expect(JSON.stringify(call)).not.toContain(PNG_BASE64);

		await adapter.dispose();
	});

	it("drops an image when nothing stores it", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startWithStore(agent, undefined);
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "tc-nostore",
			title: "Read shot.png",
			kind: "read",
			status: "completed",
			content: [
				{
					type: "content",
					content: { type: "image", data: PNG_BASE64, mimeType: "image/png" },
				},
			],
		});
		await flush();

		const call = lastToolCall(events);
		expect(call?.content).toEqual([]);
		expect(call?.attachments).toBeUndefined();

		await adapter.dispose();
	});
});

describe("AcpAdapter when the agent fails", () => {
	it("fails the running turn when the agent exits mid-turn", async () => {
		const agent = new FakeAcpAgent();
		agent.holdPrompts = true;
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "hi" }]);
		await flush();

		agent.exit(1);
		await flush();

		const turns = events.flatMap((e) => (e.kind === "turn" ? [e.turn] : []));
		expect(turns.at(-1)?.status).toBe("failed");
		expect(sessionsOf(events).at(-1)?.status).toBe("dead");

		await adapter.dispose();
	});

	it("shows what the agent wrote to stderr when it exits", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.stderr("Error: ANTHROPIC_API_KEY is invalid\n");
		agent.exit(1);
		await flush();

		const notice = itemsOf(events).find((i) => i.kind === "notice");
		expect(textOf(notice)).toContain("ANTHROPIC_API_KEY is invalid");

		await adapter.dispose();
	});

	it("keeps a resume dead when the load fails for a reason other than a missing session", async () => {
		const agent = new FakeAcpAgent();
		agent.loadError = {
			code: -32603,
			message: "Internal error: model not found",
		};
		const { adapter, events } = startAdapter(agent, "sess-1");
		await flush(40);

		expect(agent.sent.map((f) => f.method)).toEqual([
			"initialize",
			"session/load",
		]);
		expect(sessionsOf(events).at(-1)?.status).toBe("dead");

		await adapter.dispose();
	});

	it("opens a new session when the agent does not know the session id", async () => {
		const agent = new FakeAcpAgent();
		agent.loadError = { code: -32602, message: "Unknown sessionId: sess-1" };
		const { adapter, events } = startAdapter(agent, "sess-1");
		await flush(40);

		expect(agent.sent.map((f) => f.method)).toContain("session/new");
		expect(sessionsOf(events).at(-1)?.status).toBe("idle");

		await adapter.dispose();
	});

	it("gives up on an agent that does not answer at startup", async () => {
		const agent = new FakeAcpAgent();
		agent.silent = true;
		const { adapter, events } = startAdapter(
			agent,
			undefined,
			{},
			{ startupTimeoutMs: 5 },
		);
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(sessionsOf(events).at(-1)?.status).toBe("dead");
		const notice = itemsOf(events).find((i) => i.kind === "notice");
		expect(textOf(notice)).toContain("did not answer");

		await adapter.dispose();
	});

	it("answers a pending approval as cancelled when the turn is stopped", async () => {
		const agent = new FakeAcpAgent();
		agent.holdPrompts = true;
		const { adapter } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "run the tests" }]);
		await flush();
		const requestId = agent.requestPermission("sess-1", "tc-1");
		await flush();

		adapter.cancelTurn();

		expect(agent.sent.map((f) => f.method)).toContain("session/cancel");
		expect(agent.responseTo(requestId)?.result).toEqual({
			outcome: { outcome: "cancelled" },
		});

		await adapter.dispose();
	});
});

it("keeps an explicitly requested conversation intact when loading fails", async () => {
	const agent = new FakeAcpAgent();
	agent.loadFails = true;
	const adapter = new AcpAdapter({
		command: "fake",
		createTransport: (_opts, handlers) => agent.transport(handlers),
		now: () => 1,
		mintId: () => "strict",
	});
	const events: AdapterEvent[] = [];
	void collect(
		adapter.start({
			cwd: "/work",
			resume: { harnessSessionId: "sess-1" },
			strictResume: true,
		}),
		events,
	);
	await flush(40);
	expect(agent.sent.map((f) => f.method)).toEqual([
		"initialize",
		"session/load",
	]);
	expect(sessionsOf(events).some((s) => s.status === "dead")).toBe(true);
	await adapter.dispose();
});

it("ends startup and closes an agent that never answers initialize", async () => {
	let closed = 0;
	const adapter = new AcpAdapter({
		command: "never",
		startupTimeoutMs: 10,
		createTransport: () => ({
			send: () => {},
			close: async () => {
				closed++;
			},
		}),
	});
	const events: AdapterEvent[] = [];
	const iterator = adapter.start({ cwd: "/tmp" });
	const collected = (async () => {
		for await (const event of iterator) events.push(event);
	})();
	await collected;
	expect(
		events.some((e) => e.kind === "session" && e.session.status === "dead"),
	).toBe(true);
	expect(closed).toBe(1);
	await adapter.dispose();
});

describe("v1 user replay boundaries", () => {
	for (const whole of [true, false]) {
		it(
			whole
				? "Cursor v1 replay keeps consecutive prompts separate"
				: "other v1 replay retains streaming chunks of one prompt",
			async () => {
				const agent = new FakeAcpAgent();
				agent.protocolVersion = 1;
				agent.replayUpdates = [
					{
						sessionUpdate: "user_message_chunk",
						content: { type: "text", text: "first " },
					},
					{
						sessionUpdate: "user_message_chunk",
						content: { type: "text", text: "second" },
					},
					{
						sessionUpdate: "agent_message_chunk",
						content: { type: "text", text: "reply" },
					},
				];
				const adapter = new AcpAdapter({
					command: "fake",
					wholeUserMessageReplay: whole,
					createTransport: (_opts, handlers) => agent.transport(handlers),
				});
				const events: AdapterEvent[] = [];
				void collect(
					adapter.start({
						cwd: "/work",
						resume: { harnessSessionId: "sess-1" },
					}),
					events,
				);
				await flush(40);
				const users = events.filter(
					(event) =>
						event.kind === "item" && event.item.kind === "user_message",
				);
				const texts = users.map((event) =>
					event.kind === "item" && event.item.kind === "user_message"
						? userMessageSchema
								.parse(event.item)
								.content.filter((content) => content.type === "text")
								.map((content) => (content.type === "text" ? content.text : ""))
								.join("")
						: "",
				);
				expect(texts).toEqual(whole ? ["first ", "second"] : ["first second"]);
				if (whole) {
					expect(users[0]?.kind === "item" && users[0].turnId).not.toBe(
						users[1]?.kind === "item" && users[1].turnId,
					);
				}
				await adapter.dispose();
			},
		);
	}
});

it("keeps named v2 user prompts separate while joining chunks with the same identity", async () => {
	const agent = new FakeAcpAgent();
	agent.protocolVersion = 2;
	agent.replayUpdates = [
		{
			sessionUpdate: "user_message_chunk",
			messageId: "u1",
			content: { type: "text", text: "o" },
		},
		{
			sessionUpdate: "user_message_chunk",
			messageId: "u1",
			content: { type: "text", text: "ne" },
		},
		{
			sessionUpdate: "user_message_chunk",
			messageId: "u2",
			content: { type: "text", text: "t" },
		},
		{
			sessionUpdate: "user_message_chunk",
			messageId: "u2",
			content: { type: "text", text: "wo" },
		},
	];
	const adapter = new AcpAdapter({
		command: "fake",
		createTransport: (_opts, handlers) => agent.transport(handlers),
	});
	const events: AdapterEvent[] = [];
	void collect(
		adapter.start({ cwd: "/work", resume: { harnessSessionId: "sess-1" } }),
		events,
	);
	await flush(40);
	const users = events.filter(
		(event) => event.kind === "item" && event.item.kind === "user_message",
	);
	expect(
		users.map((event) =>
			event.kind === "item" && event.item.kind === "user_message"
				? userMessageSchema
						.parse(event.item)
						.content.filter((content) => content.type === "text")
						.map((content) => (content.type === "text" ? content.text : ""))
						.join("")
				: "",
		),
	).toEqual(["one", "two"]);
	expect(users[0]?.kind === "item" && users[0].turnId).not.toBe(
		users[1]?.kind === "item" && users[1].turnId,
	);
	await adapter.dispose();
});

it("keeps Cursor whole user replay boundaries even when protocol v2 is negotiated without message ids", async () => {
	const agent = new FakeAcpAgent();
	agent.protocolVersion = 2;
	agent.replayUpdates = [
		{
			sessionUpdate: "user_message_chunk",
			content: { type: "text", text: "first" },
		},
		{
			sessionUpdate: "user_message_chunk",
			content: { type: "text", text: "second" },
		},
	];
	const adapter = new AcpAdapter({
		command: "fake",
		wholeUserMessageReplay: true,
		createTransport: (_opts, handlers) => agent.transport(handlers),
	});
	const events: AdapterEvent[] = [];
	void collect(
		adapter.start({ cwd: "/work", resume: { harnessSessionId: "sess-1" } }),
		events,
	);
	await flush(40);
	const users = events.filter(
		(event) => event.kind === "item" && event.item.kind === "user_message",
	);
	expect(users).toHaveLength(2);
	expect(users[0]?.kind === "item" && users[0].turnId).not.toBe(
		users[1]?.kind === "item" && users[1].turnId,
	);
	await adapter.dispose();
});

// Google's native agents authenticate over ACP before creating or restoring a chat.
describe("Google subscription authentication", () => {
	it.each([
		undefined,
		"google-history",
	])("authenticates before opening %s", async (resume) => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(
			agent,
			resume,
			{},
			{ authMethodId: "oauth-personal" },
		);
		await flush(24);
		const auth = agent.sent.findIndex(
			(frame) => frame.method === "authenticate",
		);
		const session = agent.sent.findIndex(
			(frame) => frame.method === (resume ? "session/load" : "session/new"),
		);
		expect(auth).toBeGreaterThan(0);
		expect(session).toBeGreaterThan(auth);
		expect(agent.sent[auth]?.params).toEqual({ methodId: "oauth-personal" });
		expect(events.some((event) => event.kind === "session")).toBe(true);
		await adapter.dispose();
	});
});

function cursorPermissionMode(
	agent: FakeAcpAgent,
	protocolVersion = 2,
	current = "agent",
) {
	agent.protocolVersion = protocolVersion;
	if (protocolVersion === 1)
		agent.newSessionModes = {
			currentModeId: current,
			availableModes: [
				{ id: "agent", name: "Agent" },
				{ id: "ask", name: "Ask" },
			],
		};
	else
		agent.newSessionConfigOptions = [
			{
				configId: "mode",
				name: "Mode",
				type: "select",
				category: "mode",
				currentValue: current,
				options: [
					{ value: "agent", name: "Agent" },
					{ value: "ask", name: "Ask" },
				],
			},
		];
}
describe("per-chat Full access", () => {
	it.each([
		1, 2,
	])("ACP %s adds full access without sending a made-up native mode", async (version) => {
		const agent = new FakeAcpAgent();
		cursorPermissionMode(agent, version);
		const { adapter, events } = startAdapter(agent);
		await flush(32);
		expect(
			sessionsOf(events)
				.at(-1)
				?.availableModes?.map((mode) => mode.id),
		).toContain(FULL_ACCESS_CHAT_MODE);
		adapter.setMode(FULL_ACCESS_CHAT_MODE);
		await flush(32);
		agent.requestPermission("sess-1", "tool-one", 9001);
		agent.requestPermission("sess-1", "tool-two", 9002);
		await flush(32);
		for (const id of [9001, 9002])
			expect(agent.sent.find((frame) => frame.id === id)?.result).toEqual({
				outcome: { outcome: "selected", optionId: "allow" },
			});
		expect(
			itemsOf(events).filter((item) => item.kind === "approval_request"),
		).toHaveLength(0);
		expect(
			agent.sent.filter(
				(frame) =>
					frame.method === "session/set_mode" ||
					frame.method === "session/set_config_option",
			),
		).toHaveLength(0);
		expect(sessionsOf(events).at(-1)?.modeId).toBe(FULL_ACCESS_CHAT_MODE);
		await adapter.dispose();
	});
	it.each([
		1, 2,
	])("ACP %s entering Plan stops automatic tool approvals while the native mode change is pending", async (version) => {
		const agent = new FakeAcpAgent();
		agent.protocolVersion = version;
		const modes = [
			{ id: "default", name: "Default" },
			{ id: "plan", name: "Plan" },
			{ id: "bypassPermissions", name: "Bypass permissions" },
		];
		if (version === 1)
			agent.newSessionModes = {
				currentModeId: "bypassPermissions",
				availableModes: modes,
			};
		else
			agent.newSessionConfigOptions = [
				{
					configId: "permission_mode",
					name: "Mode",
					type: "select",
					category: "mode",
					currentValue: "bypassPermissions",
					options: modes.map((mode) => ({ value: mode.id, name: mode.name })),
				},
			];
		const { adapter, events } = startAdapter(agent);
		await flush(32);
		expect(
			sessionsOf(events)
				.filter((session) => session.availableModes)
				.at(-1)?.availableModes,
		).toContainEqual({ id: "plan", label: "Plan" });
		agent.holdSelections = true;
		adapter.setMode("plan");
		await flush(32);
		agent.requestPermission("sess-1", "plan-request");
		await flush();
		expect(agent.lastPermissionResponse()).toBeUndefined();
		expect(
			sessionsOf(events)
				.filter((session) => session.modeId)
				.at(-1)?.modeId,
		).toBe("plan");
		const request = agent.sent.find(
			(frame) =>
				frame.method ===
				(version === 1 ? "session/set_mode" : "session/set_config_option"),
		);
		expect(request?.params).toMatchObject(
			version === 1
				? { modeId: "plan" }
				: { configId: "permission_mode", value: "plan" },
		);
		agent.releaseSelections();
		await flush(32);
		expect(agent.lastPermissionResponse()).toBeUndefined();
		agent.holdSelections = false;
		adapter.setMode("bypassPermissions");
		await flush(32);
		expect(agent.lastPermissionResponse()?.result).toEqual({
			outcome: { outcome: "selected", optionId: "allow" },
		});
		await adapter.dispose();
	});

	it.each([
		1, 2,
	])("ACP %s Plan approves workspace reads once and keeps implementation approval manual", async (version) => {
		const agent = new FakeAcpAgent();
		agent.protocolVersion = version;
		agent.newSessionModes = {
			currentModeId: "plan",
			availableModes: [
				{ id: "plan", name: "Plan" },
				{ id: "default", name: "Default" },
				{ id: "bypassPermissions", name: "Full access" },
			],
		};
		const cwd = process.cwd();
		const { adapter, events } = startAdapter(
			agent,
			undefined,
			{ cwd, modeId: "plan" },
			{ defaultModeId: "bypassPermissions", forkPlanReadPermissions: true },
		);
		await flush(32);
		agent.notify("sess-1", {
			sessionUpdate: "tool_call",
			toolCallId: "plan-read",
			_meta: { claudeCode: { toolName: "Bash" } },
		});
		const ask = (
			id: number,
			toolCall: Record<string, unknown>,
			sessionId = "sess-1",
		) =>
			agent.requestServer(
				"session/request_permission",
				{
					sessionId,
					toolCall,
					options: [
						{ optionId: "always", name: "Always", kind: "allow_always" },
						{ optionId: "once", name: "Yes", kind: "allow_once" },
					],
				},
				id,
			);
		const read = {
			toolCallId: "plan-read",
			rawInput: { command: `cd '${cwd}' && git status --short` },
		};
		ask(9100, read);
		await flush();
		expect(agent.responseTo(9100)?.result).toEqual({
			outcome: { outcome: "selected", optionId: "once" },
		});
		expect(
			itemsOf(events).filter((item) => item.kind === "approval_request"),
		).toHaveLength(0);
		ask(9101, { name: "ExitPlanMode", rawInput: {} });
		ask(9102, { name: "Edit", rawInput: { file_path: `${cwd}/package.json` } });
		ask(9103, read, "another-session");
		await flush();
		for (const id of [9101, 9102, 9103])
			expect(agent.responseTo(id)).toBeUndefined();
		adapter.setMode("default");
		await flush(32);
		ask(9104, read);
		await flush();
		expect(agent.responseTo(9104)).toBeUndefined();
		await adapter.dispose();
	});

	it("Plan keeps another harness's read permissions manual", async () => {
		const agent = new FakeAcpAgent();
		agent.newSessionModes = { currentModeId: "plan", availableModes: [] };
		const cwd = process.cwd();
		const { adapter } = startAdapter(agent, undefined, { cwd, modeId: "plan" });
		await flush(32);
		agent.requestServer(
			"session/request_permission",
			{
				sessionId: "sess-1",
				toolCall: {
					name: "Read",
					rawInput: { file_path: `${cwd}/package.json` },
				},
				options: [{ optionId: "once", name: "Yes", kind: "allow_once" }],
			},
			9150,
		);
		await flush();
		expect(agent.responseTo(9150)).toBeUndefined();
		await adapter.dispose();
	});

	it("Plan does not inherit bypass approvals when Claude enters it through a native update", async () => {
		const agent = new FakeAcpAgent();
		agent.newSessionModes = {
			currentModeId: "bypassPermissions",
			availableModes: [],
		};
		const { adapter } = startAdapter(
			agent,
			undefined,
			{ cwd: process.cwd() },
			{ defaultModeId: "bypassPermissions", forkPlanReadPermissions: true },
		);
		await flush(32);
		agent.notify("sess-1", {
			sessionUpdate: "current_mode_update",
			currentModeId: "plan",
		});
		agent.requestServer(
			"session/request_permission",
			{
				sessionId: "sess-1",
				toolCall: { name: "ExitPlanMode", rawInput: {} },
				options: [
					{ optionId: "implement", name: "Implement", kind: "allow_once" },
				],
			},
			9200,
		);
		await flush();
		expect(agent.responseTo(9200)).toBeUndefined();
		await adapter.dispose();
	});

	it("Plan read approvals wait for mode confirmation and stay disabled after a rejected change", async () => {
		const agent = new FakeAcpAgent();
		agent.newSessionModes = { currentModeId: "default", availableModes: [] };
		const cwd = process.cwd();
		const { adapter } = startAdapter(
			agent,
			undefined,
			{ cwd },
			{ defaultModeId: "bypassPermissions", forkPlanReadPermissions: true },
		);
		await flush(32);
		agent.holdSelections = true;
		adapter.setMode("plan");
		const ask = (id: number) =>
			agent.requestServer(
				"session/request_permission",
				{
					sessionId: "sess-1",
					toolCall: {
						name: "Read",
						rawInput: { file_path: `${cwd}/package.json` },
					},
					options: [{ optionId: "once", name: "Yes", kind: "allow_once" }],
				},
				id,
			);
		ask(9300);
		await flush();
		expect(agent.responseTo(9300)).toBeUndefined();
		agent.releaseSelections();
		await flush(32);
		ask(9301);
		await flush();
		expect(agent.responseTo(9301)?.result).toEqual({
			outcome: { outcome: "selected", optionId: "once" },
		});
		agent.holdSelections = false;
		adapter.setMode("default");
		await flush(32);
		agent.rejectSelections = true;
		adapter.setMode("plan");
		await flush(32);
		ask(9302);
		await flush();
		expect(agent.responseTo(9302)).toBeUndefined();
		await adapter.dispose();
	});

	it("selecting full access also resolves a tool's pending Allow request", async () => {
		const agent = new FakeAcpAgent();
		cursorPermissionMode(agent);
		const { adapter, events } = startAdapter(agent);
		await flush(32);
		agent.requestPermission("sess-1", "already-blocked");
		await flush();
		expect(agent.lastPermissionResponse()).toBeUndefined();
		adapter.setMode(FULL_ACCESS_CHAT_MODE);
		await flush(32);
		expect(agent.lastPermissionResponse()?.result).toEqual({
			outcome: { outcome: "selected", optionId: "allow" },
		});
		expect(
			itemsOf(events)
				.filter((item) => item.kind === "approval_request")
				.at(-1)?.status,
		).toBe("answered");
		await adapter.dispose();
	});
	it("Ask immediately restores tool approvals", async () => {
		const agent = new FakeAcpAgent();
		cursorPermissionMode(agent);
		const { adapter, events } = startAdapter(agent);
		await flush(32);
		adapter.setMode(FULL_ACCESS_CHAT_MODE);
		await flush(32);
		adapter.setMode("ask");
		await flush(32);
		agent.requestPermission("sess-1", "manual-again");
		await flush();
		expect(agent.lastPermissionResponse()).toBeUndefined();
		expect(sessionsOf(events).at(-1)?.status).toBe("awaiting_input");
		expect(
			agent.sent.find((frame) => frame.method === "session/set_config_option")
				?.params,
		).toMatchObject({ value: "ask" });
		await adapter.dispose();
	});
	it("full access moves Ask to the advertised tool mode before approving", async () => {
		const agent = new FakeAcpAgent();
		cursorPermissionMode(agent, 2, "ask");
		agent.holdSelections = true;
		const { adapter } = startAdapter(agent);
		await flush(32);
		adapter.setMode(FULL_ACCESS_CHAT_MODE);
		await flush(32);
		agent.requestPermission("sess-1", "pending-mode");
		await flush();
		expect(agent.lastPermissionResponse()).toBeUndefined();
		expect(
			agent.sent.find((frame) => frame.method === "session/set_config_option")
				?.params,
		).toMatchObject({ value: "agent" });
		agent.releaseSelections();
		await flush(32);
		expect(agent.lastPermissionResponse()?.result).toBeDefined();
		await adapter.dispose();
	});
	it("failed native mode selection restores Ask without approving anything", async () => {
		const agent = new FakeAcpAgent();
		cursorPermissionMode(agent, 2, "ask");
		agent.rejectSelections = true;
		const { adapter, events } = startAdapter(agent);
		await flush(32);
		adapter.setMode(FULL_ACCESS_CHAT_MODE);
		await flush(32);
		agent.requestPermission("sess-1", "after-rejection");
		await flush();
		expect(agent.lastPermissionResponse()).toBeUndefined();
		expect(
			sessionsOf(events)
				.filter((session) => session.modeId)
				.at(-1)?.modeId,
		).toBe("ask");
		await adapter.dispose();
	});
	it("a late Full access confirmation cannot override a later Ask choice", async () => {
		const agent = new FakeAcpAgent();
		cursorPermissionMode(agent, 2, "ask");
		agent.holdSelections = true;
		const { adapter, events } = startAdapter(agent);
		await flush(32);
		adapter.setMode(FULL_ACCESS_CHAT_MODE);
		await flush();
		adapter.setMode("ask");
		await flush();
		agent.releaseSelections();
		await flush(32);
		agent.requestPermission("sess-1", "late-ack");
		await flush();
		expect(agent.lastPermissionResponse()).toBeUndefined();
		expect(
			sessionsOf(events)
				.filter((session) => session.modeId)
				.at(-1)?.modeId,
		).toBe("ask");
		expect(
			agent.sent
				.filter((frame) => frame.method === "session/set_config_option")
				.map((frame) => (frame.params as { value: string }).value),
		).toEqual(["agent", "ask"]);
		await adapter.dispose();
	});
	it("a loaded native conversation restores the explicitly saved Full access choice", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent, "saved-native", {
			modeId: FULL_ACCESS_CHAT_MODE,
		});
		await flush(40);
		agent.requestPermission("saved-native", "restored");
		await flush(32);
		expect(agent.lastPermissionResponse()?.result).toBeDefined();
		expect(
			sessionsOf(events)
				.filter((session) => session.modeId)
				.at(-1)?.modeId,
		).toBe(FULL_ACCESS_CHAT_MODE);
		expect(agent.sent.some((frame) => frame.method === "session/new")).toBe(
			false,
		);
		await adapter.dispose();
	});
	it("mode updates keep Full access active; requests from another conversation stay manual", async () => {
		const agent = new FakeAcpAgent();
		cursorPermissionMode(agent);
		const { adapter, events } = startAdapter(agent);
		await flush(32);
		adapter.setMode(FULL_ACCESS_CHAT_MODE);
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "config_option_update",
			configOptions: [
				{
					configId: "mode",
					name: "Mode",
					type: "select",
					category: "mode",
					currentValue: "agent",
					options: [
						{ value: "agent", name: "Agent" },
						{ value: "ask", name: "Ask" },
					],
				},
			],
		});
		await flush();
		expect(
			sessionsOf(events)
				.filter((session) => session.modeId)
				.at(-1)?.modeId,
		).toBe(FULL_ACCESS_CHAT_MODE);
		agent.requestPermission("different-session", "foreign");
		await flush();
		expect(agent.lastPermissionResponse()).toBeUndefined();
		await adapter.dispose();
	});
	it("Full access approves tools while actual questions still need an answer", async () => {
		const agent = new FakeAcpAgent();
		cursorPermissionMode(agent);
		const { adapter, events } = startAdapter(agent);
		await flush(32);
		agent.requestPermission("sess-1", "tool");
		agent.requestServer(
			"cursor/ask_question",
			{
				toolCallId: "question",
				questions: [
					{
						id: "q",
						prompt: "Which branch?",
						options: [{ id: "main", label: "main" }],
					},
				],
			},
			9501,
		);
		await flush();
		adapter.setMode(FULL_ACCESS_CHAT_MODE);
		await flush(32);
		expect(agent.lastPermissionResponse()?.result).toBeDefined();
		expect(agent.sent.find((frame) => frame.id === 9501)).toBeUndefined();
		expect(sessionsOf(events).at(-1)?.status).toBe("awaiting_input");
		await adapter.dispose();
	});
	it("uses the real bypass mode when the agent advertises it", async () => {
		const agent = new FakeAcpAgent();
		agent.newSessionModes = {
			currentModeId: "default",
			availableModes: [
				{ id: "default", name: "Default" },
				{ id: "yolo", name: "YOLO" },
			],
		};
		const { adapter, events } = startAdapter(agent);
		await flush(32);
		adapter.setMode("yolo");
		await flush(32);
		expect(
			agent.sent.find((frame) => frame.method === "session/set_mode")?.params,
		).toMatchObject({ modeId: "yolo" });
		expect(
			sessionsOf(events)
				.filter((session) => session.availableModes)
				.at(-1)
				?.availableModes?.filter((mode) => mode.id === FULL_ACCESS_CHAT_MODE),
		).toHaveLength(0);
		agent.requestPermission("sess-1", "native-bypass");
		await flush();
		expect(agent.lastPermissionResponse()?.result).toBeDefined();
		await adapter.dispose();
	});
});
