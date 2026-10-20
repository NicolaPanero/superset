import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FORK_CLAUDE_MCP_EXEC, withForkCodexMcpArgs } from "./fork-mcp-wrapper";

const home = mkdtempSync(join(tmpdir(), "fork-mcp-wrapper-"));
afterAll(() => rmSync(home, { recursive: true, force: true }));
mkdirSync(join(home, "state"));
const printArgs = join(home, "print-args");
writeFileSync(printArgs, '#!/bin/bash\nprintf "%s\\n" "$@"\n', { mode: 0o755 });

function run(script: string, args: string[], supersetHome = home): string[] {
	const result = spawnSync("bash", ["-c", script, "wrapper", ...args], {
		env: {
			PATH: process.env.PATH,
			REAL_BIN: printArgs,
			SUPERSET_HOME_DIR: supersetHome,
		},
		encoding: "utf8",
	});
	return result.stdout.split("\n").filter(Boolean);
}

test("claude gets the launch file last, except for subcommands and after --", () => {
	const config = join(home, "state", "fork-mcp-claude.json");
	writeFileSync(config, '{"mcpServers":{}}');
	expect(run(FORK_CLAUDE_MCP_EXEC, ["-p", "fix it"])).toEqual([
		"-p",
		"fix it",
		"--mcp-config",
		config,
	]);
	expect(run(FORK_CLAUDE_MCP_EXEC, ["mcp", "list"])).toEqual(["mcp", "list"]);
	expect(run(FORK_CLAUDE_MCP_EXEC, ["--", "prompt"])).toEqual(["--", "prompt"]);
	expect(run(FORK_CLAUDE_MCP_EXEC, ["-p", "x"], join(home, "none"))).toEqual([
		"-p",
		"x",
	]);
});

test("codex gets one -c override per line and secret values only as environment", () => {
	writeFileSync(
		join(home, "state", "fork-mcp-codex.args"),
		'mcp_servers.remote.url="https://mcp.example.com/"\nmcp_servers.remote.env_http_headers={"Authorization"="SUPERSET_FORK_MCP_SECRET_0"}',
	);
	writeFileSync(
		join(home, "state", "fork-mcp-codex.env"),
		"export SUPERSET_FORK_MCP_SECRET_0='Bearer a '\"'\"'b'\n",
	);
	const script = withForkCodexMcpArgs(
		`_superset_codex_args=()
_superset_configure_project_trust() { :; }
_superset_configure_project_trust
"$REAL_BIN" "\${_superset_codex_args[@]}" "$@" "env:$SUPERSET_FORK_MCP_SECRET_0"
`,
	);
	expect(run(script, ["exec"])).toEqual([
		"-c",
		'mcp_servers.remote.url="https://mcp.example.com/"',
		"-c",
		'mcp_servers.remote.env_http_headers={"Authorization"="SUPERSET_FORK_MCP_SECRET_0"}',
		"exec",
		"env:Bearer a 'b",
	]);
	expect(() => withForkCodexMcpArgs("no marker")).toThrow();
});
