import { Database } from "bun:sqlite";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
	chmodSync,
	linkSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join, relative, resolve } from "node:path";
import { tag } from "../../../../scripts/fork/txcript-version.json";
import type { TransferAgent } from "./registry";
import { runHelper, TxcriptTransferProvider } from "./txcript";

const helper = Reflect.get(
	globalThis,
	Symbol.for("superset.fork.testHelper"),
) as string | undefined;
if (!helper)
	throw new Error("Use bun run test:fork:native to supply the pinned helper");
const nativeHelper = helper;
let lastResult: unknown;
const provider = new TxcriptTransferProvider(nativeHelper, async (...args) => {
	const value = await runHelper(...args);
	if (args[1].length === 0) lastResult = value;
	return value;
});
const agents: TransferAgent[] = [
	"claude",
	"codex",
	"cursor-agent",
	"grok",
	"opencode",
];
const sources = new Map<
	TransferAgent,
	{ root: string; reference: string; id: string }
>();
const text =
	"Preserve all native context 日本語 · Explain <user_info>example</user_info> · " +
	"x".repeat(50000) +
	" · end of message";
const reply = "Synthetic assistant reply: keep conversation history.";
const followup =
	"Continue after the tool error without inventing a user prompt.";
const runtimeContext =
	"Completed previous work; next inspect the integration tests.";
const failedOutput = "fixture command failed: permission denied";
const structuredOutput = { files: ["a.ts", "b.ts"], count: 2 };
let root: string, cwd: string;
const previous = { path: process.env.PATH, db: process.env.OPENCODE_DB };
function directory(name: string) {
	const path = join(root, name);
	mkdirSync(path, { recursive: true });
	return path;
}
function target(agent: TransferAgent, name: string) {
	if (agent !== "opencode") return directory(name);
	const path = process.env.OPENCODE_DB;
	if (!path) throw new Error("Missing OpenCode fixture database");
	return path;
}
async function convert(source: TransferAgent, to: TransferAgent, name: string) {
	const input = sources.get(source);
	if (!input) throw new Error("missing fixture source");
	let result: Awaited<ReturnType<typeof provider.transfer>>;
	try {
		result = await provider.transfer({
			sourceAgent: source,
			sourceSessionId: input.id,
			sourceTerminalId: "fixture",
			sourceRoot: input.root,
			sourceReference: input.reference,
			targetAgent: to,
			targetRoot: target(to, name),
			cwd,
		});
	} catch (error) {
		const raw = lastResult as Record<string, unknown> | undefined;
		console.error("Synthetic conversion path diagnostic", {
			source,
			to,
			targetRoot: target(to, name),
			cwd,
			reference: raw?.reference,
			returnedCwd: raw?.cwd,
			returnedAgent: raw?.targetAgent,
		});
		throw error;
	}

	if (result.mode !== "native")
		throw new Error("native conversion unexpectedly used context");
	return result;
}
beforeAll(async () => {
	root = realpathSync(
		mkdtempSync(join(tmpdir(), "fork-native-conversations-")),
	);
	cwd = directory("project");
	const bin = directory("bin"),
		dbPath = join(directory("opencode"), "opencode.db");
	process.env.OPENCODE_DB = dbPath;
	process.env.PATH = `${bin}${delimiter}${previous.path ?? ""}`;
	const db = new Database(dbPath);
	db.exec(
		"CREATE TABLE session(id TEXT PRIMARY KEY,directory TEXT,title TEXT,version TEXT,time_created INTEGER,time_archived INTEGER,model TEXT,slug TEXT,time_updated INTEGER,parent_id TEXT);CREATE TABLE message(id TEXT PRIMARY KEY,session_id TEXT,time_created INTEGER,data TEXT);CREATE TABLE part(id TEXT PRIMARY KEY,message_id TEXT,session_id TEXT,data TEXT);",
	);
	db.close();
	const importer = join(bin, "opencode.ts");
	writeFileSync(
		importer,
		readFileSync(
			join(import.meta.dir, "../../../../scripts/fork/opencode-fixture.ts"),
		),
	);
	if (process.platform === "win32") {
		const binary = Reflect.get(
			globalThis,
			Symbol.for("superset.fork.testImporter"),
		) as string | undefined;
		if (!binary)
			throw new Error("Missing precompiled isolated OpenCode importer");
		linkSync(binary, join(bin, "opencode.exe"));
	} else {
		const executable = join(bin, "opencode");
		writeFileSync(executable, readFileSync(importer));
		chmodSync(executable, 0o755);
	}
	const claudeRoot = directory("claude"),
		id = randomUUID(),
		reference = join(claudeRoot, `${id}.jsonl`);
	const turns = [
		{ role: "user", content: text },
		{
			role: "assistant",
			content: [
				{ type: "thinking", thinking: "Inspect the source before continuing" },
				{ type: "text", text: reply },
			],
		},
		{
			role: "assistant",
			content: [
				{
					type: "tool_use",
					id: "read:fixture",
					name: "Read",
					input: { file_path: "a.ts" },
				},
				{
					type: "tool_use",
					id: "shell:fixture",
					name: "Bash",
					input: { command: "fixture-command" },
				},
			],
		},
		{
			role: "user",
			content: [
				{
					type: "tool_result",
					tool_use_id: "read:fixture",
					content: structuredOutput,
				},
				{
					type: "tool_result",
					tool_use_id: "shell:fixture",
					content: failedOutput,
					is_error: true,
				},
			],
		},
		{
			role: "user",
			content: [
				{ type: "text", text: followup },
				{
					type: "image",
					source: { type: "base64", media_type: "image/png", data: "UE5H" },
				},
			],
		},
		{
			role: "assistant",
			content: [{ type: "text", text: "Finished after the follow-up." }],
		},
	];
	let parent: string | null = null;
	const records = turns.map((message, index) => {
		const uuid = randomUUID();
		const record = {
			type: message.role,
			uuid,
			parentUuid: parent,
			sessionId: id,
			cwd,
			timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
			message,
		};
		parent = uuid;
		return record;
	});
	writeFileSync(
		reference,
		`${records.map((value) => JSON.stringify(value)).join("\n")}\n`,
	);
	sources.set("claude", { root: claudeRoot, reference, id });
	for (const agent of agents.filter((agent) => agent !== "claude")) {
		const converted = await convert("claude", agent, `seed-${agent}`);
		if (agent === "grok") {
			const historyPath = join(converted.reference, "chat_history.jsonl");
			const records = readFileSync(historyPath, "utf8")
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line));
			records[0].content[0].text = `<user_info>OS: fixture</user_info>\n<rules>internal project rules</rules>\n${records[0].content[0].text}\n<system-reminder>runtime reminder</system-reminder>`;
			records.unshift(
				{
					type: "user",
					content: [
						{
							type: "text",
							text: `<system-reminder>The following skills are available:\n${"- fixture-skill: synthetic description, /fixture/test/SKILL.md\n".repeat(800)}</system-reminder>\n<system-reminder>MCP servers connected: fixture-browser. Synthetic tool instructions.</system-reminder>`,
						},
					],
				},
				{
					type: "user",
					synthetic_reason: "project_instructions",
					content: [
						{
							type: "text",
							text: "This internal instruction is not a human prompt",
						},
					],
				},
				{
					type: "user",
					synthetic_reason: "compaction_meta",
					content: [{ type: "text", text: runtimeContext }],
				},
				{
					type: "user",
					synthetic_reason: "auto_continue",
					content: [
						{
							type: "text",
							text: "This automatic restart is not a human prompt",
						},
					],
				},
			);
			writeFileSync(
				historyPath,
				`${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
			);
		}
		sources.set(agent, {
			root: target(agent, `seed-${agent}`),
			reference: converted.reference,
			id: converted.targetSessionId,
		});
	}
});
afterAll(() => {
	if (previous.path === undefined) delete process.env.PATH;
	else process.env.PATH = previous.path;
	if (previous.db === undefined) delete process.env.OPENCODE_DB;
	else process.env.OPENCODE_DB = previous.db;
	if (root) rmSync(root, { recursive: true, force: true });
});

test("the real engine matches the pin and declares conversion-only support", async () => {
	expect(await provider.capabilities()).toMatchObject({
		protocolVersion: 1,
		engineVersion: tag.slice(1),
		conversionOnly: true,
	});
});
test("Codex imports preserve reasoning text without provider-private state", async () => {
	const converted = await convert(
		"claude",
		"codex",
		"codex-replayable-reasoning",
	);
	const items = readFileSync(converted.reference, "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line))
		.filter((record) => record.type === "response_item")
		.map((record) => record.payload);
	expect(
		items.some((item) =>
			["reasoning", "compaction", "web_search_call"].includes(item.type),
		),
	).toBe(false);
	const reasoning = items.find((item) =>
		item.content?.some(
			(block: { text?: string }) =>
				block.text === "Inspect the source before continuing",
		),
	);
	expect(reasoning).toMatchObject({
		type: "message",
		role: "assistant",
		phase: "commentary",
	});
});
for (const source of agents)
	for (const to of agents.filter((agent) => agent !== source))
		test(`real native codec ${source} -> ${to} preserves long Unicode conversation`, async () => {
			const sourceData = sources.get(source);
			if (!sourceData) throw new Error("Missing fixture source");
			const original =
				source === "claude"
					? readFileSync(sourceData.reference, "utf8")
					: undefined;
			const converted = await convert(source, to, `${source}-to-${to}`);
			const path = relative(root, resolve(converted.reference));
			expect(isAbsolute(path) || path.startsWith(".." + "/")).toBe(false);
			expect(converted.messageCount).toBeGreaterThanOrEqual(2);
			expect(converted.cwd).toBe(cwd);
			expect(converted.targetSessionId).not.toBe(sourceData.id);
			if (original)
				expect(readFileSync(sourceData.reference, "utf8")).toBe(original);
			let reference = converted.reference;
			if (to !== "claude") {
				const returned = await provider.transfer({
					sourceAgent: to,
					sourceSessionId: converted.targetSessionId,
					sourceTerminalId: "fixture",
					sourceRoot: target(to, `${source}-to-${to}`),
					sourceReference: reference,
					targetAgent: "claude",
					targetRoot: directory(`return-${source}-${to}`),
					cwd,
				});
				if (returned.mode !== "native")
					throw new Error("round trip used context");
				reference = returned.reference;
			}
			const records = readFileSync(reference, "utf8")
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line));
			const body = JSON.stringify(
				records.map((record) => record.message?.content).filter(Boolean),
			);
			expect(body).toContain(text);
			expect(body).toContain(reply);
			const userTexts = records
				.filter((record) => record.type === "user")
				.flatMap((record) =>
					typeof record.message?.content === "string"
						? [record.message.content]
						: (record.message?.content ?? [])
								.filter((block: { type: string }) => block.type === "text")
								.map((block: { text: string }) => block.text),
				);
			expect(userTexts).toEqual([text, followup]);
			const blocks = records.flatMap((record) =>
				Array.isArray(record.message?.content) ? record.message.content : [],
			);
			const calls = blocks.filter((block) => block.type === "tool_use");
			const results = blocks.filter((block) => block.type === "tool_result");
			expect(calls).toHaveLength(2);
			expect(results).toHaveLength(2);
			expect(new Set(calls.map((block) => block.id))).toEqual(
				new Set(results.map((block) => block.tool_use_id)),
			);
			expect(
				results.find((block) => block.content === failedOutput)?.is_error,
			).toBe(true);
			expect(JSON.stringify(results)).toContain("a.ts");
			expect(
				blocks.some(
					(block) => block.type === "image" && block.source.data === "UE5H",
				),
			).toBe(true);
			if (source === "grok") {
				const context = records
					.filter((record) => record.type === "assistant")
					.flatMap((record) => record.message?.content ?? []);
				expect(JSON.stringify(context)).toContain(runtimeContext);
				expect(body).not.toContain("fixture-skill");
				expect(body).not.toContain("MCP servers connected");
			}
		});

for (const scenario of [
	"source_id_mismatch",
	"source_cwd_mismatch",
	"source_incomplete",
	"source_outside_store",
] as const) {
	test(`native helper refuses ${scenario} without creating a target session`, async () => {
		const source = sources.get("claude");
		if (!source) throw new Error("Missing native fixture");
		const targetRoot = directory(`invalid-${scenario}`);
		let sourceReference = source.reference;
		if (scenario === "source_incomplete") {
			sourceReference = join(source.root, "incomplete.jsonl");
			writeFileSync(sourceReference, '{"type":"user"');
		}
		await expect(
			runHelper(
				nativeHelper,
				[],
				{
					sourceAgent: "claude_code",
					sourceSessionId:
						scenario === "source_id_mismatch" ? randomUUID() : source.id,
					sourceRoot:
						scenario === "source_outside_store"
							? directory("unrelated-source")
							: source.root,
					sourceReference,
					targetAgent: "codex",
					targetRoot,
					cwd:
						scenario === "source_cwd_mismatch"
							? directory("unrelated-project")
							: cwd,
				},
				undefined,
				{ cwd },
			),
		).rejects.toThrow(scenario);
		expect(readdirSync(targetRoot)).toEqual([]);
	});
}
