import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { resolveSupersetHomeDir } from "@superset/agent-setup";
import type { HarnessMcpServer } from "@superset/chat-runtime";
import { z } from "zod";

export const MCP_SERVER_NAME = /^[A-Za-z0-9_-]{1,64}$/;

const valuesSchema = z.record(z.string(), z.string());

export const forkMcpServerSchema = z.discriminatedUnion("transport", [
	z.object({
		transport: z.literal("stdio"),
		name: z.string().regex(MCP_SERVER_NAME),
		enabled: z.boolean(),
		command: z.string().min(1),
		args: z.array(z.string()),
		env: valuesSchema,
	}),
	z.object({
		transport: z.enum(["http", "sse"]),
		name: z.string().regex(MCP_SERVER_NAME),
		enabled: z.boolean(),
		url: z.string().url(),
		headers: valuesSchema,
	}),
]);

export type ForkMcpServer = z.infer<typeof forkMcpServerSchema>;

const fileSchema = z.object({
	version: z.literal(1),
	servers: z.array(forkMcpServerSchema),
});

export interface ForkMcpPaths {
	servers: string;
	claudeConfig: string;
	codexArgs: string;
	codexEnv: string;
}

export function forkMcpPaths(home = resolveSupersetHomeDir()): ForkMcpPaths {
	return {
		servers: join(home, "fork", "mcp-servers.json"),
		claudeConfig: join(home, "state", "fork-mcp-claude.json"),
		codexArgs: join(home, "state", "fork-mcp-codex.args"),
		codexEnv: join(home, "state", "fork-mcp-codex.env"),
	};
}

function writePrivate(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	const temporary = `${path}.${process.pid}.tmp`;
	writeFileSync(temporary, content, { mode: 0o600 });
	renameSync(temporary, path);
}

/** Servers already configured for Claude, so the first list starts from them. */
export function importClaudeMcpServers(
	claudeJsonPath: string,
): ForkMcpServer[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(claudeJsonPath, "utf8"));
	} catch {
		return [];
	}
	const entries = Object.entries(
		((parsed as { mcpServers?: unknown }).mcpServers ?? {}) as Record<
			string,
			Record<string, unknown>
		>,
	);
	return entries.flatMap(([name, value]): ForkMcpServer[] => {
		const type = value.type ?? "stdio";
		const candidate =
			type === "stdio"
				? {
						transport: "stdio",
						name,
						enabled: true,
						command: value.command,
						args: value.args ?? [],
						env: value.env ?? {},
					}
				: {
						transport: type,
						name,
						enabled: true,
						url: value.url,
						headers: value.headers ?? {},
					};
		const server = forkMcpServerSchema.safeParse(candidate);
		return server.success ? [server.data] : [];
	});
}

function claudeConfig(servers: ForkMcpServer[]): string {
	const mcpServers = Object.fromEntries(
		servers.map((server) => [
			server.name,
			server.transport === "stdio"
				? { command: server.command, args: server.args, env: server.env }
				: { type: server.transport, url: server.url, headers: server.headers },
		]),
	);
	return `${JSON.stringify({ mcpServers }, null, 2)}\n`;
}

function tomlTable(values: Record<string, string>): string {
	const entries = Object.entries(values).map(
		([key, value]) => `${JSON.stringify(key)}=${JSON.stringify(value)}`,
	);
	return `{${entries.join(",")}}`;
}

const SHELL_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

/**
 * One `-c` override per line, and the secret values as `export` lines. The
 * wrapper sources the values into Codex's environment, so they never appear
 * in its arguments. "SECRET" in each name keeps them out of agent commands.
 * Codex has no SSE transport, so SSE is left out.
 */
export function codexLaunch(servers: ForkMcpServer[]): {
	args: string;
	env: string;
} {
	const exports: string[] = [];
	const secret = (value: string) => {
		const name = `SUPERSET_FORK_MCP_SECRET_${exports.length}`;
		exports.push(`export ${name}=${shellQuote(value)}`);
		return name;
	};
	const lines = servers.flatMap((server) => {
		const key = `mcp_servers.${server.name}`;
		if (server.transport !== "stdio") {
			if (server.transport === "sse") return [];
			return [
				`${key}.url=${JSON.stringify(server.url)}`,
				`${key}.env_http_headers=${tomlTable(
					Object.fromEntries(
						Object.entries(server.headers).map(([header, value]) => [
							header,
							secret(value),
						]),
					),
				)}`,
			];
		}
		const mapped = Object.entries(server.env).filter(([name]) =>
			SHELL_NAME.test(name),
		);
		const plain = Object.fromEntries(
			Object.entries(server.env).filter(([name]) => !SHELL_NAME.test(name)),
		);
		if (mapped.length === 0)
			return [
				`${key}.command=${JSON.stringify(server.command)}`,
				`${key}.args=${JSON.stringify(server.args)}`,
				`${key}.env=${tomlTable(plain)}`,
			];
		const forwarded = mapped.map(([name, value]) => ({
			name,
			from: secret(value),
		}));
		const script = `${forwarded
			.map(({ name, from }) => `export ${name}="$${from}"; unset ${from}; `)
			.join("")}exec "$@"`;
		return [
			`${key}.command="/bin/sh"`,
			`${key}.args=${JSON.stringify([
				"-c",
				script,
				"superset-mcp",
				server.command,
				...server.args,
			])}`,
			`${key}.env=${tomlTable(plain)}`,
			`${key}.env_vars=${JSON.stringify(forwarded.map(({ from }) => from))}`,
		];
	});
	return {
		args: lines.length > 0 ? `${lines.join("\n")}\n` : "",
		env: exports.length > 0 ? `${exports.join("\n")}\n` : "",
	};
}

/** Rewrites the launch files the agent wrappers read; removes them when empty. */
function writeLaunchFiles(paths: ForkMcpPaths, servers: ForkMcpServer[]) {
	const enabled = servers.filter((server) => server.enabled);
	const codex = codexLaunch(enabled);
	if (enabled.length > 0)
		writePrivate(paths.claudeConfig, claudeConfig(enabled));
	else rmSync(paths.claudeConfig, { force: true });
	if (codex.env) writePrivate(paths.codexEnv, codex.env);
	else rmSync(paths.codexEnv, { force: true });
	if (codex.args) writePrivate(paths.codexArgs, codex.args);
	else rmSync(paths.codexArgs, { force: true });
}

export function writeForkMcpServers(
	servers: ForkMcpServer[],
	paths = forkMcpPaths(),
): void {
	const file = fileSchema.parse({ version: 1, servers });
	writePrivate(paths.servers, `${JSON.stringify(file, null, 2)}\n`);
	writeLaunchFiles(paths, file.servers);
}

function loadForkMcpServers(
	paths: ForkMcpPaths,
	claudeJsonPath: string,
): ForkMcpServer[] | null {
	if (!existsSync(paths.servers)) {
		const imported = importClaudeMcpServers(claudeJsonPath);
		writeForkMcpServers(imported, paths);
		return imported;
	}
	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(paths.servers, "utf8"));
	} catch {
		raw = null;
	}
	const parsed = fileSchema.safeParse(raw);
	return parsed.success ? parsed.data.servers : null;
}

/**
 * The one list every agent gets. Created on first read from the servers
 * Claude already has, which stay where they are.
 */
export function readForkMcpServers(
	paths = forkMcpPaths(),
	claudeJsonPath = join(homedir(), ".claude.json"),
): ForkMcpServer[] {
	const servers = loadForkMcpServers(paths, claudeJsonPath);
	if (servers) return servers;
	console.warn(
		`[host-service] ${paths.servers} is not a valid MCP server list; ignoring it`,
	);
	return [];
}

export class ForkMcpListInvalidError extends Error {
	constructor(readonly path: string) {
		super(`${path} is not a valid MCP server list. Fix or remove it first.`);
	}
}

/** The list to change; a file that does not parse is never overwritten. */
export function readForkMcpServersForUpdate(
	paths = forkMcpPaths(),
	claudeJsonPath = join(homedir(), ".claude.json"),
): ForkMcpServer[] {
	const servers = loadForkMcpServers(paths, claudeJsonPath);
	if (!servers) throw new ForkMcpListInvalidError(paths.servers);
	return servers;
}

/** Keeps the wrapper launch files in step with the list, as at host boot. */
export function syncForkMcpLaunchFiles(paths = forkMcpPaths()): void {
	writeLaunchFiles(paths, readForkMcpServers(paths));
}

export function harnessMcpServers(
	servers: ForkMcpServer[],
): HarnessMcpServer[] {
	return servers
		.filter((server) => server.enabled)
		.map(({ enabled: _enabled, ...server }) => server);
}
