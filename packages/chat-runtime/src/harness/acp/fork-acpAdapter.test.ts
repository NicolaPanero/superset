import { describe, expect, it } from "bun:test";
import {
	FULL_ACCESS_CHAT_MODE,
	userMessageSchema,
} from "@superset/chat/protocol";
import type { AdapterEvent } from "../types";
import { AcpAdapter, type AcpAdapterOptions } from "./acpAdapter";
import type { AcpTransport, AcpTransportHandlers } from "./rpcClient";

/**
 * A scripted ACP agent: auto-responds to initialize/session_new, and for
 * session/prompt delivers a canned stream of session/update notifications
 * before returning the stop reason. Captures client->agent frames for
 * assertions.
 */
/** v2 reopens a conversation with session/resume, v1 with session/load. */
function isLoad(method: unknown): boolean {
	return method === "session/load" || method === "session/resume";
}

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
	/** agentInfo.name reported at initialize, as pdev reports "paradev". */
	agentName: string | null = null;
	/** _meta attached to the first scripted agent message chunk. */
	chunkMeta: Record<string, unknown> | null = null;
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
	/** Answer for `_superset/context_usage`; undefined answers "method not found". */
	contextUsage: unknown;
	grokContextUsage: unknown;
	contextUsageRequests = 0;
	stopTaskResult = true;
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

	requestPermissionWith(params: Record<string, unknown>, id: number): void {
		this.deliver({
			jsonrpc: "2.0",
			id,
			method: "session/request_permission",
			params: { sessionId: "sess-1", ...params },
		});
	}

	requestPdevPermission(toolCallId: string, id: number): void {
		this.deliver({
			jsonrpc: "2.0",
			id,
			method: "session/request_permission",
			params: {
				sessionId: "sess-1",
				toolCall: { toolCallId, title: "Allow Write hello.txt?" },
				options: [
					{ optionId: "choice-0", name: "Allow once", kind: "allow_once" },
					{
						optionId: "choice-1",
						name: "Allow all edits this session",
						kind: "allow_once",
					},
					{ optionId: "choice-2", name: "Deny", kind: "allow_once" },
				],
			},
		});
	}

	askQuestion(sessionId: string, toolCallId: string): number {
		const id = 9003;
		this.deliver({
			jsonrpc: "2.0",
			id,
			method: "session/request_permission",
			params: {
				sessionId,
				toolCall: { toolCallId, title: "Color: Which color?" },
				options: [
					{ optionId: "choice-0", name: "Red", kind: "allow_once" },
					{ optionId: "choice-1", name: "Blue", kind: "allow_once" },
					{
						optionId: "choice-2",
						name: "Other (type an answer)",
						kind: "allow_once",
					},
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
					...(this.agentName ? { agentInfo: { name: this.agentName } } : {}),
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
			} else if (isLoad(frame.method) && this.loadError) {
				this.deliver({ jsonrpc: "2.0", id: frame.id, error: this.loadError });
			} else if (isLoad(frame.method) && this.loadFails) {
				this.deliver({
					jsonrpc: "2.0",
					id: frame.id,
					error: { code: -32002, message: "Resource not found: sess-1" },
				});
			} else if (isLoad(frame.method) && this.replayUpdates) {
				const sessionId = (frame.params as { sessionId: string }).sessionId;
				for (const update of this.replayUpdates) this.notify(sessionId, update);
				this.respond(frame.id as number, null);
			} else if (isLoad(frame.method) && this.wholeMessageReplay) {
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
			} else if (isLoad(frame.method) && this.loadConfigOptions) {
				const sessionId = (frame.params as { sessionId: string }).sessionId;
				this.notify(sessionId, {
					sessionUpdate: "config_option_update",
					configOptions: this.loadConfigOptions,
				});
				this.respond(frame.id as number, null);
			} else if (isLoad(frame.method)) {
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
			} else if (frame.method === "_x.ai/session/info") {
				if (this.grokContextUsage === undefined)
					this.deliver({
						jsonrpc: "2.0",
						id: frame.id,
						error: { code: -32601, message: "Method not found" },
					});
				else this.respond(frame.id as number, this.grokContextUsage);
			} else if (frame.method === "_superset/context_usage") {
				this.contextUsageRequests++;
				if (this.contextUsage === undefined)
					this.deliver({
						jsonrpc: "2.0",
						id: frame.id,
						error: { code: -32601, message: "Method not found" },
					});
				else this.respond(frame.id as number, { usage: this.contextUsage });
			} else if (frame.method === "_session/async_task/stop") {
				this.respond(frame.id as number, { stopped: this.stopTaskResult });
			} else if (frame.method === "_session/steering") {
				this.respond(frame.id as number, { outcome: this.steeringOutcome });
			} else if (frame.method === "session/prompt" && this.holdPrompts) {
				this.heldPrompts.push(frame.id as number);
			} else if (frame.method === "session/prompt") {
				this.notify("sess-1", {
					sessionUpdate: "agent_message_chunk",
					content: { type: "text", text: "Hello" },
					...(this.chunkMeta ? { _meta: this.chunkMeta } : {}),
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
		| "requestTimeoutMs"
		| "clientApprovalModes"
		| "shellPollMs"
		| "backgroundDetailIntervalMs"
		| "startupTimeoutMs"
		| "forkGrokContextUsage"
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

describe("AcpAdapter fork extensions", () => {
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
			expect(await adapter.fork({ upToMessageId: "native:reply-1" })).toBe(
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

	it("keeps the output file a background task reports, at spawn or later", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "async_task_spawned",
			asyncTaskId: "task-1",
			name: "bun run dev",
			canStop: true,
			outputFilePath: "/tmp/task-1.output",
		});
		agent.notify("sess-1", {
			sessionUpdate: "async_task_spawned",
			asyncTaskId: "task-2",
			name: "watch",
			canStop: true,
		});
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "async_task_progress",
			asyncTaskId: "task-2",
			outputFilePath: "/tmp/task-2.output",
		});
		await flush();

		const lists = events.flatMap((event) =>
			event.kind === "session" && event.session.backgroundTasks
				? [event.session.backgroundTasks.map((task) => task.outputPath)]
				: [],
		);
		expect(lists.at(-1)).toEqual(["/tmp/task-1.output", "/tmp/task-2.output"]);

		await adapter.dispose();
	});

	it("reads Grok context on attach and refreshes it after a turn without prompting for metrics", async () => {
		const agent = new FakeAcpAgent();
		agent.grokContextUsage = {
			result: { context: { used: 120, total: 2000 } },
		};
		const { adapter, events } = startAdapter(
			agent,
			undefined,
			{},
			{ forkGrokContextUsage: true },
		);
		await flush(30);
		expect(
			sessionsOf(events)
				.flatMap((s) => (s.contextUsage ? [s.contextUsage] : []))
				.at(-1),
		).toEqual({ used: 120, size: 2000 });
		agent.grokContextUsage = {
			result: { context: { used: 500, total: 2000 } },
		};
		adapter.prompt([{ type: "text", text: "hello" }]);
		await flush(30);
		expect(
			sessionsOf(events)
				.flatMap((s) => (s.contextUsage ? [s.contextUsage] : []))
				.at(-1),
		).toEqual({ used: 500, size: 2000 });
		expect(
			agent.sent.filter((f) => f.method === "session/prompt"),
		).toHaveLength(1);
		await adapter.dispose();
	});

	it("older Grok agents can work without context reporting and are probed only once", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(
			agent,
			undefined,
			{},
			{ forkGrokContextUsage: true },
		);
		await flush(30);
		adapter.prompt([{ type: "text", text: "hello" }]);
		await flush(30);
		expect(
			agent.sent.filter((f) => f.method === "_x.ai/session/info"),
		).toHaveLength(1);
		expect(sessionsOf(events).some((s) => s.contextUsage)).toBe(false);
		expect(sessionsOf(events).some((s) => s.status === "dead")).toBe(false);
		await adapter.dispose();
	});

	it("reports context usage and asks for the breakdown only between turns", async () => {
		const agent = new FakeAcpAgent();
		agent.holdPrompts = true;
		agent.contextUsage = { totalTokens: 10, maxTokens: 100, categories: [] };
		const { adapter, events } = startAdapter(agent);
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "usage_update",
			used: 10,
			size: 100,
		});
		agent.notify("sess-1", {
			sessionUpdate: "usage_update",
			used: 10,
			size: 100,
		});
		await flush();
		expect(
			sessionsOf(events).flatMap((s) =>
				s.contextUsage ? [s.contextUsage] : [],
			),
		).toEqual([{ used: 10, size: 100 }]);

		expect(await adapter.contextBreakdown()).toEqual(agent.contextUsage);
		adapter.prompt([{ type: "text", text: "work" }]);
		await flush();
		expect(await adapter.contextBreakdown()).toBeNull();
		expect(agent.contextUsageRequests).toBe(1);
		await adapter.dispose();
	});

	it("stops asking for a breakdown an agent does not support", async () => {
		const agent = new FakeAcpAgent();
		const { adapter } = startAdapter(agent);
		await flush();
		expect(await adapter.contextBreakdown()).toBeNull();
		expect(await adapter.contextBreakdown()).toBeNull();
		expect(agent.contextUsageRequests).toBe(1);
		await adapter.dispose();
	});

	it("removes a confirmed stopped task without requiring a second event, but retains refused stops", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();
		agent.notify("foreign", {
			sessionUpdate: "async_task_spawned",
			asyncTaskId: "stray",
			name: "Unrelated",
			canStop: true,
		});
		agent.notify("sess-1", {
			sessionUpdate: "async_task_spawned",
			asyncTaskId: "task",
			name: "dev server",
			canStop: true,
		});
		await flush();
		const tasks = () =>
			sessionsOf(events)
				.filter((session) => session.backgroundTasks)
				.at(-1)?.backgroundTasks;
		expect(tasks()?.map((task) => task.id)).toEqual(["task"]);
		agent.stopTaskResult = false;
		expect(await adapter.stopBackgroundTask("task")).toBe(false);
		expect(tasks()?.map((task) => task.id)).toEqual(["task"]);
		agent.stopTaskResult = true;
		expect(await adapter.stopBackgroundTask("task")).toBe(true);
		expect(tasks()).toEqual([]);
		await adapter.dispose();
	});

	it("preserves Markdown plans across full replacement updates", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();
		for (const content of [
			"# First draft",
			"# Final draft\n\n- Verify the result",
		]) {
			agent.notify("sess-1", {
				sessionUpdate: "plan_update",
				plan: { type: "markdown", planId: "document", content },
			});
			await flush();
		}
		const plans = itemsOf(events).filter((item) => item.kind === "plan");
		expect(plans.length).toBe(2);
		expect(plans[1]).toMatchObject({
			id: plans[0]?.id,
			startedAtMs: plans[0]?.startedAtMs,
			markdown: "# Final draft\n\n- Verify the result",
			entries: [],
		});
		await adapter.dispose();
	});

	it("routes Grok plan approval and rejects plans belonging to another session", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();
		agent.requestServer(
			"x.ai/exit_plan_mode",
			{
				sessionId: "sess-1",
				toolCallId: "grok-plan",
				planContent: "# Implementation plan",
			},
			9400,
		);
		await flush();
		const approval = itemsOf(events).find(
			(item) => item.kind === "approval_request",
		);
		expect(approval).toMatchObject({
			presentation: "plan",
			detail: [{ type: "text", text: "# Implementation plan" }],
		});
		adapter.respondToApproval(approval?.id ?? "", { type: "accept" });
		await flush();
		expect(agent.responseTo(9400)?.result).toEqual({ outcome: "approved" });
		agent.requestServer(
			"_x.ai/exit_plan_mode",
			{
				sessionId: "foreign",
				toolCallId: "foreign-plan",
				planContent: "Unrelated",
			},
			9401,
		);
		await flush();
		expect(agent.responseTo(9401)?.error).toMatchObject({ code: -32602 });
		expect(
			itemsOf(events).some(
				(item) =>
					item.kind === "approval_request" &&
					item.targetItemId === "foreign-plan",
			),
		).toBe(false);
		await adapter.dispose();
	});

	it("negotiates full plan documents and archives removed plans without losing their text", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();
		const initialize = agent.sent.find(
			(frame) => frame.method === "initialize",
		);
		expect(initialize?.params).toMatchObject({
			clientCapabilities: { plan: {} },
			capabilities: { plan: {} },
		});
		agent.notify("sess-1", {
			sessionUpdate: "plan_update",
			plan: { type: "markdown", planId: "p1", content: "# Complete plan" },
		});
		agent.notify("sess-1", { sessionUpdate: "plan_removed", planId: "p1" });
		await flush();
		const plans = itemsOf(events).filter((item) => item.kind === "plan");
		expect(plans.at(-1)).toMatchObject({
			id: plans[0]?.id,
			markdown: "# Complete plan",
			removed: true,
		});
		await adapter.dispose();
	});

	it("keeps file plans as references and ignores unknown plan content", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "plan_update",
			plan: {
				type: "file",
				planId: "file-plan",
				uri: "file:///tmp/My%20plan.md",
			},
		});
		agent.notify("sess-1", {
			sessionUpdate: "plan_update",
			plan: { type: "_future", planId: "future", content: "Not Markdown" },
		});
		await flush();
		expect(
			itemsOf(events).filter((item) => item.kind === "plan"),
		).toMatchObject([{ path: "file:///tmp/My%20plan.md", entries: [] }]);
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
		"session/resume",
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
		const session = agent.sent.findIndex((frame) =>
			resume ? isLoad(frame.method) : frame.method === "session/new",
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
	])("ACP %s Plan waits for native confirmation, then approves tools automatically", async (version) => {
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
		expect(agent.lastPermissionResponse()?.result).toEqual({
			outcome: { outcome: "selected", optionId: "allow" },
		});
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
	])("ACP %s Plan has full tool access and keeps plan approval and questions manual", async (version) => {
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
			{ defaultModeId: "bypassPermissions" },
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
		ask(9105, { name: "AskUserQuestion", rawInput: {} });
		ask(9106, { name: "mcp__service__search", rawInput: {} });
		await flush();
		for (const id of [9102, 9106])
			expect(agent.responseTo(id)?.result).toEqual({
				outcome: { outcome: "selected", optionId: "once" },
			});
		for (const id of [9101, 9103, 9105])
			expect(agent.responseTo(id)).toBeUndefined();
		adapter.setMode("default");
		await flush(32);
		ask(9104, read);
		await flush();
		expect(agent.responseTo(9104)).toBeUndefined();
		await adapter.dispose();
	});

	it("Plan approves tool permissions for other harnesses too", async () => {
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
		expect(agent.responseTo(9150)?.result).toEqual({
			outcome: { outcome: "selected", optionId: "once" },
		});
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
			{ defaultModeId: "bypassPermissions" },
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

	it("Plan tool approvals wait for mode confirmation and stay disabled after a rejected change", async () => {
		const agent = new FakeAcpAgent();
		agent.newSessionModes = { currentModeId: "default", availableModes: [] };
		const cwd = process.cwd();
		const { adapter } = startAdapter(
			agent,
			undefined,
			{ cwd },
			{ defaultModeId: "bypassPermissions" },
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
