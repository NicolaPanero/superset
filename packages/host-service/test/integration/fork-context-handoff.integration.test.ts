import { afterEach, beforeEach, expect, test } from "bun:test";
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
import { join } from "node:path";
import { sessionLineageNodes } from "../../src/db/fork-schema";
import { hostAgentConfigs } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { seedWorkspace } from "../helpers/seed";

const SESSION = "5b0e3c1a-7f2d-4c8e-9a61-2d4f8b7e1c90";
let dir: string;
let host: TestHost | undefined;

/**
 * A stand-in for txcript-transfer: 40 messages, each about 2,000 characters,
 * and every request logged. In "old" mode it rejects `all`, like an engine
 * released before the field.
 */
function installHelper(mode: "new" | "old") {
	const bin = join(process.env.SUPERSET_HOME_DIR ?? "", "bin");
	mkdirSync(bin, { recursive: true });
	const path = join(bin, "txcript-transfer");
	writeFileSync(
		path,
		`#!${process.execPath}
const request = JSON.parse(await Bun.stdin.text());
const log = ${JSON.stringify(join(dir, "requests.jsonl"))};
const fs = require("node:fs");
fs.appendFileSync(log, JSON.stringify(request) + "\\n");
if (${JSON.stringify(mode)} === "old" && "all" in request) {
	process.stderr.write(JSON.stringify({ error: "input_invalid" }));
	process.exit(1);
}
const end = Math.min(request.before ?? 40, 40);
const messages = [];
for (let index = 0; index < end; index++)
	messages.push({
		index,
		role: index % 2 ? "assistant" : "user",
		timestampMs: index,
		blocks: [
			{ type: "text", text: (index === 0 ? "ORIGINAL " : "") + "m" + index + " " + "x".repeat(2000) },
			{ type: "image", mediaType: "image/png", data: "SU1BR0VEQVRB" },
		],
	});
console.log(JSON.stringify({ protocolVersion: 1, engineVersion: "0.14.4-fork.24", truncated: false, nextBefore: null, messages }));
`,
	);
	chmodSync(path, 0o755);
}

function requests(): Array<Record<string, unknown>> {
	try {
		return readFileSync(join(dir, "requests.jsonl"), "utf8")
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line));
	} catch {
		return [];
	}
}

async function setup() {
	host = await createTestHost();
	const profile = join(dir, "claude-profile");
	host.db
		.insert(hostAgentConfigs)
		.values({
			id: "claude-config",
			presetId: "claude",
			label: "Claude",
			command: "claude",
			promptTransport: "argv",
			envJson: JSON.stringify({ CLAUDE_CONFIG_DIR: profile }),
			displayOrder: 0,
		})
		.run();
	const worktree = join(dir, "worktree");
	mkdirSync(worktree);
	const project = join(
		profile,
		"projects",
		worktree.replaceAll(/[^a-zA-Z0-9]/g, "-"),
	);
	mkdirSync(project, { recursive: true });
	writeFileSync(
		join(project, `${SESSION}.jsonl`),
		`${JSON.stringify({ type: "user", sessionId: SESSION })}\n`,
	);
	const workspaceId = seedWorkspace(host, {
		worktreePath: worktree,
		branch: "main",
		type: "session",
	}).id;
	const otherWorkspaceId = seedWorkspace(host, {
		worktreePath: worktree,
		branch: "other",
		type: "session",
	}).id;
	return { host, workspaceId, otherWorkspaceId };
}

const input = (workspaceId: string) => ({
	workspaceId,
	sourceTerminalId: crypto.randomUUID(),
	sourceConfigId: "claude-config",
	sourceSessionId: SESSION,
	targetModelId: null,
});

beforeEach(() => {
	dir = realpathSync(mkdtempSync(join(tmpdir(), "fork-context-handoff-")));
});

afterEach(async () => {
	await host?.dispose();
	host = undefined;
	rmSync(dir, { recursive: true, force: true });
});

test("a context handoff selects whole messages and its source can be read back only from its workspace", async () => {
	installHelper("new");
	const { host, workspaceId, otherWorkspaceId } = await setup();

	const handoff = await host.trpc.sessionTransfer.prepareContextFromChat.mutate(
		input(workspaceId),
	);
	expect(handoff.omitted).toBeGreaterThan(0);
	expect(handoff.included + handoff.omitted).toBe(40);
	expect(handoff.prompt).toContain("#0 User:\nORIGINAL m0");
	expect(handoff.prompt).toContain("#39 Claude:\nm39");
	expect(handoff.prompt).toContain("[image image/png, not included]");
	expect(handoff.prompt).not.toContain("SU1BR0VEQVRB");
	const source = handoff.prompt.match(
		new RegExp(
			`superset fork-handoff history --local --workspace ${workspaceId} --source ([0-9a-f-]{36}) --before <n>`,
		),
	)?.[1];
	expect(source).toBeDefined();
	expect(requests()[0]).toMatchObject({
		sourceAgent: "claude_code",
		sourceSessionId: SESSION,
		all: true,
	});

	const page = await host.trpc.sessionTransfer.handoffHistory.query({
		workspaceId,
		sourceNodeId: source ?? "",
		before: 10,
	});
	expect(page.messages).toBe(10);
	expect(page.nextBefore).toBeNull();
	expect(page.text).toContain("#9 Claude:");
	expect(page.text).not.toContain("SU1BR0VEQVRB");

	const readsBefore = requests().length;
	for (const denied of [
		{ workspaceId: otherWorkspaceId, sourceNodeId: source ?? "" },
		{ workspaceId, sourceNodeId: crypto.randomUUID() },
	])
		await expect(
			host.trpc.sessionTransfer.handoffHistory.query(denied),
		).rejects.toThrow("handoff_source_unavailable");
	expect(requests()).toHaveLength(readsBefore);

	await host.trpc.sessionTransfer.prepareContextFromChat.mutate(
		input(workspaceId),
	);
	expect(host.db.select().from(sessionLineageNodes).all()).toHaveLength(1);
});

test("an engine without the whole-session field fails the handoff and records nothing", async () => {
	installHelper("old");
	const { host, workspaceId } = await setup();
	await expect(
		host.trpc.sessionTransfer.prepareContextFromChat.mutate(input(workspaceId)),
	).rejects.toThrow("input_invalid");
	expect(host.db.select().from(sessionLineageNodes).all()).toHaveLength(0);
});
