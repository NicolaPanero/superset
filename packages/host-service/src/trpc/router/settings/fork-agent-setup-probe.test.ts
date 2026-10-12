import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	grokSetupAuth,
	inspectAgentSetup,
	probeSetupChat,
	setupCandidates,
} from "./fork-agent-setup-probe";

test("Cursor detection skips a generic agent belonging to Grok", async () => {
	const calls: string[] = [];
	const result = await inspectAgentSetup(
		"cursor-agent",
		{ PATH: "/grok:/cursor" },
		{
			home: "/test",
			executable: async (file) =>
				file === "/grok/agent" || file === "/cursor/agent",
			run: async (file, args) => {
				calls.push(`${file} ${args.join(" ")}`);
				return file.startsWith("/grok")
					? "Usage: grok"
					: args[0] === "--help"
						? "Start the Cursor Agent"
						: args[0] === "--version"
							? "2026.10.01-e373342"
							: "Not logged in";
			},
			chat: async () => true,
			read: async () => null,
		},
	);
	expect(result.command).toBe("/cursor/agent");
	expect(result.version).toBe("2026.10.01-e373342");
	expect(result.auth).toBe("missing");
	expect(calls).not.toContain("/grok/agent status");
});
test("detects Grok native model credentials without returning their value", async () => {
	const result = await inspectAgentSetup(
		"grok",
		{ PATH: "/bin" },
		{
			home: "/test",
			executable: async () => true,
			run: async (_file, args) =>
				args[0] === "--help" ? "Usage: grok" : "grok 1.0.50",
			chat: async () => true,
			read: async (file) =>
				file.endsWith("config.toml")
					? '[models]\ndefault = "grok-4.7"\n[model."grok-4.7"]\napi_key = "secret-native"'
					: null,
		},
	);
	expect(result.auth).toBe("api");
	expect(result.model).toBe("grok-4.7");
	expect(result.modelOverrides).toBe(true);
	expect(JSON.stringify(result)).not.toContain("secret-native");
});
test("expired or malformed local auth never becomes a valid login", () => {
	expect(
		grokSetupAuth(
			null,
			'{"login":{"key":"secret","expires_at":1}}',
			{},
			100000,
		),
	).toBe("missing");
	expect(grokSetupAuth(null, "broken", {})).toBe("unknown");
	expect(grokSetupAuth(null, null, {})).toBe("missing");
});
test("missing CLI and bounded wrong-provider candidates remain unavailable", async () => {
	let checks = 0;
	const result = await inspectAgentSetup(
		"grok",
		{ PATH: "/a:/b:/c:/d:/e" },
		{
			home: "/test",
			executable: async () => true,
			run: async () => {
				checks++;
				return "Another CLI";
			},
			chat: async () => {
				throw new Error("must not probe wrong provider");
			},
			read: async () => null,
		},
	);
	expect(checks).toBe(3);
	expect(result.command).toBeNull();
	expect(setupCandidates("cursor-agent", { PATH: "/grok" }, "/test")).toContain(
		"/test/.local/bin/cursor-agent",
	);
});
test("ACP check only initializes and cleans its temporary working directory", async () => {
	const dir = await mkdtemp(join(tmpdir(), "superset-fake-acp-"));
	const fixture = join(dir, "agent");
	const log = join(dir, "requests.jsonl");
	await writeFile(
		fixture,
		`#!/usr/bin/env node\nconst fs=require('node:fs');require('node:readline').createInterface({input:process.stdin}).on('line',line=>{fs.appendFileSync(process.env.TEST_SETUP_LOG,JSON.stringify({request:JSON.parse(line),cwd:process.cwd()})+'\\n');console.log(JSON.stringify({jsonrpc:'2.0',id:1,result:{protocolVersion:1,agentInfo:{name:'Cursor Agent'}}}));});`,
		{ mode: 0o700 },
	);
	try {
		expect(
			await probeSetupChat(fixture, "cursor-agent", {
				...process.env,
				TEST_SETUP_LOG: log,
			}),
		).toBe(true);
		const { readFile, access } = await import("node:fs/promises");
		const lines = (await readFile(log, "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(lines).toHaveLength(1);
		expect(lines[0].request.method).toBe("initialize");
		expect(lines[0].request.params.clientCapabilities).toEqual({});
		await expect(access(lines[0].cwd)).rejects.toThrow();
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
