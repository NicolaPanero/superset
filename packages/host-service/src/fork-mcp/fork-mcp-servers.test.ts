import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergeSecrets } from "../trpc/router/fork-mcp/fork-mcp";
import {
	codexLaunch,
	ForkMcpListInvalidError,
	type ForkMcpPaths,
	harnessMcpServers,
	readForkMcpServers,
	readForkMcpServersForUpdate,
	writeForkMcpServers,
} from "./fork-mcp-servers";

const root = mkdtempSync(join(tmpdir(), "fork-mcp-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function fixture(name: string): { paths: ForkMcpPaths; claudeJson: string } {
	const dir = join(root, name);
	mkdirSync(dir, { recursive: true });
	return {
		paths: {
			servers: join(dir, "fork", "mcp-servers.json"),
			claudeConfig: join(dir, "state", "fork-mcp-claude.json"),
			codexArgs: join(dir, "state", "fork-mcp-codex.args"),
			codexEnv: join(dir, "state", "fork-mcp-codex.env"),
		},
		claudeJson: join(dir, "claude.json"),
	};
}

test("the first read imports Claude's servers and leaves Claude's file alone", () => {
	const { paths, claudeJson } = fixture("import");
	const claude = JSON.stringify({
		oauthAccount: { emailAddress: "work@example.com" },
		mcpServers: {
			remote: {
				type: "http",
				url: "https://mcp.example.com/",
				headers: { "x-api-key": "Bearer one" },
			},
			local: { command: "npx", args: ["-y", "server"] },
			broken: { type: "http" },
		},
	});
	writeFileSync(claudeJson, claude);
	expect(readForkMcpServers(paths, claudeJson).map((s) => s.name)).toEqual([
		"remote",
		"local",
	]);
	expect(readFileSync(claudeJson, "utf8")).toBe(claude);
	expect(statSync(paths.servers).mode & 0o777).toBe(0o600);
	writeFileSync(claudeJson, JSON.stringify({ mcpServers: {} }));
	expect(readForkMcpServers(paths, claudeJson)).toHaveLength(2);
});

test("launch files carry only enabled servers and disappear when none are", () => {
	const { paths } = fixture("launch");
	writeForkMcpServers(
		[
			{
				transport: "http",
				name: "remote",
				enabled: true,
				url: "https://mcp.example.com/",
				headers: { "x-api-key": 'Bearer "one"' },
			},
			{
				transport: "sse",
				name: "events",
				enabled: true,
				url: "https://sse.example.com/",
				headers: {},
			},
			{
				transport: "stdio",
				name: "off",
				enabled: false,
				command: "npx",
				args: [],
				env: {},
			},
		],
		paths,
	);
	expect(JSON.parse(readFileSync(paths.claudeConfig, "utf8"))).toEqual({
		mcpServers: {
			remote: {
				type: "http",
				url: "https://mcp.example.com/",
				headers: { "x-api-key": 'Bearer "one"' },
			},
			events: { type: "sse", url: "https://sse.example.com/", headers: {} },
		},
	});
	expect(readFileSync(paths.codexArgs, "utf8")).toBe(
		[
			'mcp_servers.remote.url="https://mcp.example.com/"',
			'mcp_servers.remote.env_http_headers={"x-api-key"="SUPERSET_FORK_MCP_SECRET_0"}',
			"",
		].join("\n"),
	);
	expect(readFileSync(paths.codexEnv, "utf8")).toBe(
		"export SUPERSET_FORK_MCP_SECRET_0='Bearer \"one\"'\n",
	);
	expect(statSync(paths.codexArgs).mode & 0o777).toBe(0o600);
	expect(statSync(paths.codexEnv).mode & 0o777).toBe(0o600);
	expect(
		harnessMcpServers(readForkMcpServers(paths)).map((s) => s.name),
	).toEqual(["remote", "events"]);

	writeForkMcpServers([], paths);
	expect(existsSync(paths.claudeConfig)).toBe(false);
	expect(existsSync(paths.codexArgs)).toBe(false);
	expect(existsSync(paths.codexEnv)).toBe(false);
});

test("a local server gets its secret environment from the launcher, not from arguments", () => {
	const launch = codexLaunch([
		{
			transport: "stdio",
			name: "local",
			enabled: true,
			command: "printenv",
			args: ["API_KEY"],
			env: { API_KEY: "it's secret" },
		},
	]);
	expect(launch.args).not.toContain("it's secret");
	const args = JSON.parse(
		launch.args
			.split("\n")
			.find((line) => line.startsWith("mcp_servers.local.args="))
			?.slice("mcp_servers.local.args=".length) ?? "[]",
	) as string[];
	const exported = /^export (\w+)=/.exec(launch.env)?.[1] ?? "";
	expect(launch.args).toContain(`mcp_servers.local.env_vars=["${exported}"]`);
	const result = spawnSync("/bin/sh", args, {
		env: { PATH: process.env.PATH, [exported]: "it's secret" },
		encoding: "utf8",
	});
	expect(result.stdout).toBe("it's secret\n");
});

test("an unreadable list gives no servers to a session and is never overwritten", () => {
	const { paths } = fixture("corrupt");
	writeForkMcpServers([], paths);
	writeFileSync(paths.servers, "{not json");
	expect(readForkMcpServers(paths)).toEqual([]);
	expect(() => readForkMcpServersForUpdate(paths)).toThrow(
		ForkMcpListInvalidError,
	);
	expect(readFileSync(paths.servers, "utf8")).toBe("{not json");
});

test("an empty secret keeps the stored value and a new name needs one", () => {
	expect(
		mergeSecrets(
			[{ name: "Authorization" }, { name: "x-extra", value: "two" }],
			{ Authorization: "Bearer one", dropped: "old" },
		),
	).toEqual({ Authorization: "Bearer one", "x-extra": "two" });
	expect(() => mergeSecrets([{ name: "missing" }], {})).toThrow();
});
