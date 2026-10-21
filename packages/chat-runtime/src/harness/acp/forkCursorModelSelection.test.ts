import { describe, expect, test } from "bun:test";
import type { AdapterEvent } from "../types";
import { AcpAdapter, type AcpAdapterOptions } from "./acpAdapter";
import type { AcpTransportHandlers } from "./rpcClient";

const OPUS = "claude-opus-5-5[context=300k,effort=medium,fast=false]";
const COMPOSER = "composer-2.5[fast=false]";
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function fixture(
	options: {
		resume?: boolean;
		modelId?: string;
		reject?: boolean;
		mismatch?: boolean;
		hold?: boolean;
		timeout?: number;
		parameterized?: boolean;
		resolveAttachment?: AcpAdapterOptions["resolveAttachment"];
	} = {},
) {
	const sent: Array<{
		id: number;
		method: string;
		params: Record<string, string>;
	}> = [];
	const used: string[] = [];
	const held: Array<() => void> = [];
	const events: AdapterEvent[] = [];
	let activeModel = COMPOSER;
	let reject = options.reject;
	let mismatch = options.mismatch;
	let activeEffort = "medium";
	let activeContext = "300k";
	let activeFast = "false";
	let handlers: AcpTransportHandlers;
	const modelOption = (
		value = options.parameterized ? "claude-opus-5-5" : OPUS,
	) => ({
		id: "model",
		name: "Model",
		category: "model",
		type: "select",
		currentValue: value,
		options: (options.parameterized
			? ["claude-opus-5-5", "composer-2.5"]
			: [OPUS, COMPOSER]
		).map((value) => ({ value, name: value })),
	});
	const effortOption = () => ({
		id: "effort",
		name: "Effort",
		category: "thought_level",
		type: "select",
		currentValue: activeEffort,
		options: ["low", "medium", "high", "xhigh", "max"].map((value) => ({
			value,
			name: value,
		})),
	});
	const configOptions = (value?: string) => [
		modelOption(value),
		...(options.parameterized
			? [
					effortOption(),
					{
						id: "context",
						name: "Context",
						category: "model_config",
						type: "select",
						currentValue: activeContext,
						options: ["300k", "1m"].map((value) => ({ value, name: value })),
					},
					{
						id: "fast",
						name: "Fast",
						category: "model_config",
						type: "select",
						currentValue: activeFast,
						options: ["false", "true"].map((value) => ({ value, name: value })),
					},
				]
			: []),
	];
	const adapter = new AcpAdapter({
		command: "fake-cursor",
		forkCursorModelSelection: true,
		requestTimeoutMs: options.timeout ?? 100,
		resolveAttachment: options.resolveAttachment,
		createTransport: (_opts, target) => {
			handlers = target;
			return {
				close: async () => {},
				send: (line) => {
					const frame = JSON.parse(line);
					sent.push(frame);
					const reply = (result: unknown) =>
						handlers.onLine(
							JSON.stringify({ jsonrpc: "2.0", id: frame.id, result }),
						);
					queueMicrotask(() => {
						switch (frame.method) {
							case "initialize":
								return reply({ protocolVersion: 1 });
							case "session/new":
							case "session/load":
								return reply({
									sessionId: "cursor-session",
									configOptions: configOptions(),
								});
							case "session/set_config_option": {
								const respond = () => {
									if (reject)
										return handlers.onLine(
											JSON.stringify({
												jsonrpc: "2.0",
												id: frame.id,
												error: { code: -32602, message: "model unavailable" },
											}),
										);
									if (frame.params.configId === "model")
										activeModel = frame.params.value;
									else if (frame.params.configId === "effort")
										activeEffort = frame.params.value;
									else if (frame.params.configId === "context")
										activeContext = frame.params.value;
									else if (frame.params.configId === "fast")
										activeFast = frame.params.value;
									reply({
										configOptions: configOptions(
											mismatch ? COMPOSER : activeModel,
										),
									});
								};
								return options.hold ? held.push(respond) : respond();
							}
							case "session/prompt":
								used.push(
									options.parameterized
										? `${activeModel}:${activeEffort}`
										: activeModel,
								);
								return reply({ stopReason: "end_turn" });
						}
					});
				},
			};
		},
	});
	void (async () => {
		for await (const event of adapter.start({
			cwd: "/tmp",
			modelId: options.modelId,
			...(options.resume
				? { resume: { harnessSessionId: "cursor-session" } }
				: {}),
		}))
			events.push(event);
	})();
	return {
		adapter,
		sent,
		used,
		events,
		release: () => {
			for (const respond of held.splice(0)) respond();
		},
		allow: () => {
			reject = false;
			mismatch = false;
		},
		deny: () => {
			reject = true;
		},
	};
}

describe("Cursor model selection", () => {
	test("requests Cursor's native model parameters and exposes effort levels", async () => {
		const f = fixture({ modelId: "claude-opus-5-5", parameterized: true });
		try {
			await tick();
			expect(
				f.sent.find((frame) => frame.method === "initialize")?.params,
			).toMatchObject({
				clientCapabilities: { _meta: { parameterizedModelPicker: true } },
			});
			const state = f.events.filter((e) => e.kind === "session").at(-1);
			expect(
				state?.kind === "session" &&
					state.session.configOptions
						?.find((o) => o.category === "thought_level")
						?.options.map((o) => o.id),
			).toEqual(["low", "medium", "high", "xhigh", "max"]);
			f.adapter.setConfigOption("effort", "high");
			f.adapter.prompt([{ type: "text", text: "hello" }]);
			await tick();
			expect(f.used).toEqual(["claude-opus-5-5:high"]);
		} finally {
			await f.adapter.dispose();
		}
	});

	test.each([
		OPUS.replace("medium", "high"),
		"claude-opus-5-5-high",
	])("restores the effort saved in %s", async (modelId) => {
		const f = fixture({ modelId, parameterized: true });
		try {
			f.adapter.prompt([{ type: "text", text: "hello" }]);
			await tick();
			expect(f.used).toEqual(["claude-opus-5-5:high"]);
		} finally {
			await f.adapter.dispose();
		}
	});

	test("rejecting an effort change blocks prompts until that setting is confirmed", async () => {
		const f = fixture({ modelId: "claude-opus-5-5", parameterized: true });
		try {
			await tick();
			f.deny();
			f.adapter.setConfigOption("effort", "max");
			f.adapter.prompt([{ type: "text", text: "hello" }]);
			await tick();
			expect(f.used).toEqual([]);
			f.allow();
			f.adapter.setConfigOption("effort", "low");
			f.adapter.prompt([{ type: "text", text: "retry" }]);
			await tick();
			expect(f.used).toEqual(["claude-opus-5-5:low"]);
		} finally {
			await f.adapter.dispose();
		}
	});

	test("a user's effort choice takes precedence over legacy startup parameters", async () => {
		const f = fixture({ modelId: OPUS, parameterized: true, hold: true });
		try {
			await tick();
			f.adapter.setConfigOption("effort", "high");
			f.adapter.prompt([{ type: "text", text: "hello" }]);
			for (let i = 0; i < 5; i++) {
				f.release();
				await tick();
			}
			expect(f.used).toEqual(["claude-opus-5-5:high"]);
		} finally {
			await f.adapter.dispose();
		}
	});

	test("a parameter confirmation cannot clear a rejected model selection", async () => {
		const f = fixture({
			modelId: "claude-opus-5-5",
			parameterized: true,
			reject: true,
		});
		try {
			await tick();
			f.allow();
			f.adapter.setConfigOption("effort", "high");
			f.adapter.prompt([{ type: "text", text: "hello" }]);
			await tick();
			expect(f.used).toEqual([]);
		} finally {
			await f.adapter.dispose();
		}
	});
	test.each([
		false,
		true,
	])("applies the advertised model before a prompt, resume=%s", async (resume) => {
		const f = fixture({ resume, modelId: OPUS });
		try {
			f.adapter.prompt([{ type: "text", text: "hello" }]);
			await tick();
			expect(f.used).toEqual([OPUS]);
		} finally {
			await f.adapter.dispose();
		}
	});

	test("applies the advertised model when no launch model was saved", async () => {
		const f = fixture();
		try {
			f.adapter.prompt([{ type: "text", text: "hello" }]);
			await tick();
			expect(f.used).toEqual([OPUS]);
		} finally {
			await f.adapter.dispose();
		}
	});

	test.each([
		{ reject: true },
		{ mismatch: true },
	])("does not send a prompt without model confirmation: %j", async (failure) => {
		const f = fixture({ modelId: OPUS, ...failure });
		try {
			f.adapter.prompt([{ type: "text", text: "hello" }]);
			await tick();
			expect(f.used).toEqual([]);
			expect(
				f.events.some((e) => e.kind === "turn" && e.turn.status === "failed"),
			).toBe(true);
			f.allow();
			f.adapter.setConfigOption("model", OPUS);
			f.adapter.prompt([{ type: "text", text: "retry" }]);
			await tick();
			expect(f.used).toEqual([OPUS]);
		} finally {
			await f.adapter.dispose();
		}
	});

	test("rejects an unavailable launch model before any prompt", async () => {
		const f = fixture({ modelId: "removed-model" });
		try {
			f.adapter.prompt([{ type: "text", text: "hello" }]);
			await tick();
			expect(f.used).toEqual([]);
			expect(
				f.events.some(
					(e) => e.kind === "session" && e.session.status === "dead",
				),
			).toBe(true);
		} finally {
			await f.adapter.dispose();
		}
	});

	test("waits for model changes and uses the last choice", async () => {
		const f = fixture({ modelId: OPUS, hold: true });
		try {
			await tick();
			f.release();
			await tick();
			f.adapter.setConfigOption("model", COMPOSER);
			f.adapter.setConfigOption("model", OPUS);
			f.adapter.prompt([{ type: "text", text: "hello" }]);
			await tick();
			expect(f.used).toEqual([]);
			f.release();
			await tick();
			f.release();
			await tick();
			expect(f.used).toEqual([OPUS]);
		} finally {
			await f.adapter.dispose();
		}
	});

	test("blocks prompts after a model timeout, including a late answer", async () => {
		const f = fixture({ modelId: OPUS, hold: true, timeout: 1 });
		try {
			f.adapter.prompt([{ type: "text", text: "hello" }]);
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(f.used).toEqual([]);
			f.release();
			f.adapter.setConfigOption("model", OPUS);
			f.adapter.prompt([{ type: "text", text: "retry" }]);
			await tick();
			expect(f.used).toEqual([]);
		} finally {
			await f.adapter.dispose();
		}
	});

	test("rechecks model confirmation after resolving an attachment", async () => {
		let release!: (value: null) => void;
		const attachment = new Promise<null>((resolve) => {
			release = resolve;
		});
		const f = fixture({ modelId: OPUS, resolveAttachment: () => attachment });
		try {
			await tick();
			f.adapter.prompt([
				{
					type: "attachment",
					attachmentId: "image",
					name: "image.png",
					mimeType: "image/png",
				},
			]);
			await tick();
			f.deny();
			f.adapter.setConfigOption("model", COMPOSER);
			await tick();
			release(null);
			await tick();
			expect(f.used).toEqual([]);
		} finally {
			release(null);
			await f.adapter.dispose();
		}
	});
});
