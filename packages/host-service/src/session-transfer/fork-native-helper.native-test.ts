import { Database } from "bun:sqlite";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { tag } from "../../../../scripts/fork/txcript-version.json";
import type { TransferAgent } from "./registry";
import { TxcriptTransferProvider } from "./txcript";

const helper = Reflect.get(
	globalThis,
	Symbol.for("superset.fork.testHelper"),
) as string | undefined;
if (!helper)
	throw new Error("Use bun run test:fork:native to supply the pinned helper");
const provider = new TxcriptTransferProvider(helper);
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
	"Preserve all native context 日本語 · " +
	"x".repeat(50000) +
	" · end of message";
const reply = "Synthetic assistant reply: keep conversation history.";
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
	const result = await provider.transfer({
		sourceAgent: source,
		sourceSessionId: input.id,
		sourceTerminalId: "fixture",
		sourceRoot: input.root,
		sourceReference: input.reference,
		targetAgent: to,
		targetRoot: target(to, name),
		cwd,
	});
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
	process.env.PATH = `${bin}:${previous.path ?? ""}`;
	const db = new Database(dbPath);
	db.exec(
		"CREATE TABLE session(id TEXT PRIMARY KEY,directory TEXT,title TEXT,version TEXT,time_created INTEGER,time_archived INTEGER,model TEXT,slug TEXT,time_updated INTEGER,parent_id TEXT);CREATE TABLE message(id TEXT PRIMARY KEY,session_id TEXT,time_created INTEGER,data TEXT);CREATE TABLE part(id TEXT PRIMARY KEY,message_id TEXT,session_id TEXT,data TEXT);",
	);
	db.close();
	const importer = join(bin, "opencode");
	writeFileSync(
		importer,
		`#!/usr/bin/env bun
import {Database} from "bun:sqlite";
import {readFileSync} from "node:fs";
if(process.argv[2]!=="import")throw new Error("No login or agent commands allowed");
const data=JSON.parse(readFileSync(process.argv[3],"utf8"));
const db=new Database(process.env.OPENCODE_DB);
const info=data.info;
db.run("INSERT INTO session(id,directory,title,version,time_created,time_updated) VALUES(?,?,?,?,?,?)",[info.id,info.directory,info.title,info.version,info.time.created,info.time.updated]);
for(const message of data.messages){db.run("INSERT INTO message(id,session_id,time_created,data) VALUES(?,?,?,?)",[message.info.id,info.id,message.info.time.created,JSON.stringify(message.info)]);for(const part of message.parts)db.run("INSERT INTO part(id,message_id,session_id,data) VALUES(?,?,?,?)",[part.id,message.info.id,info.id,JSON.stringify(part)]);}
db.close();console.log("Imported session: "+info.id);
`,
	);
	chmodSync(importer, 0o755);
	const claudeRoot = directory("claude"),
		id = randomUUID(),
		reference = join(claudeRoot, `${id}.jsonl`);
	writeFileSync(
		reference,
		`${[
			{
				type: "user",
				uuid: randomUUID(),
				sessionId: id,
				cwd,
				timestamp: "2026-01-01T00:00:00Z",
				message: { role: "user", content: text },
			},
			{
				type: "assistant",
				uuid: randomUUID(),
				sessionId: id,
				cwd,
				timestamp: "2026-01-01T00:00:01Z",
				message: {
					role: "assistant",
					content: [{ type: "text", text: reply }],
				},
			},
		]
			.map((value) => JSON.stringify(value))
			.join("\n")}\n`,
	);
	sources.set("claude", { root: claudeRoot, reference, id });
	for (const agent of agents.filter((agent) => agent !== "claude")) {
		const converted = await convert("claude", agent, `seed-${agent}`);
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
		});
