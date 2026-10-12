import { execFile, spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { getBinDir } from "@superset/agent-setup";
import { grokDefaultModel } from "../../../chat-v3/acpDefaultModel/acpDefaultModel";

export type SetupAgent = "grok" | "cursor-agent";
export type SetupProbe = {
	command: string | null;
	version: string | null;
	chat: boolean;
	auth: "login" | "api" | "missing" | "unknown";
	model: string | null;
	modelOverrides: boolean;
};
const exec = promisify(execFile);
export async function readSetupFile(file: string): Promise<string | null> {
	try {
		const info = await stat(file);
		if (!info.isFile() || info.size > 1024 * 1024) return null;
		return await readFile(file, "utf8");
	} catch {
		return null;
	}
}
export async function runSetupCommand(
	command: string,
	args: string[],
	env: NodeJS.ProcessEnv,
): Promise<string | null> {
	try {
		const result = await exec(command, args, {
			env,
			timeout: 3000,
			maxBuffer: 65536,
		});
		return result.stdout + result.stderr;
	} catch {
		return null;
	}
}
export async function probeSetupChat(
	command: string,
	agent: SetupAgent,
	env: NodeJS.ProcessEnv,
	prefix: string[] = [],
): Promise<boolean> {
	const cwd = await mkdtemp(join(tmpdir(), "superset-agent-check-"));
	try {
		return await new Promise<boolean>((resolve) => {
			const child = spawn(
				command,
				[...prefix, ...(agent === "grok" ? ["agent", "stdio"] : ["acp"])],
				{ cwd, env, stdio: ["pipe", "pipe", "ignore"] },
			);
			let buffer = "";
			let settled = false;
			const finish = (value: boolean) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				child.once("close", () => resolve(value));
				child.stdin.destroy();
				child.kill("SIGKILL");
			};
			const timer = setTimeout(() => finish(false), 3000);
			child.on("error", () => finish(false));
			child.on("exit", () => finish(false));
			child.stdin.on("error", () => finish(false));
			child.stdout.on("data", (chunk: Buffer) => {
				buffer += chunk.toString();
				if (buffer.length > 65536) return finish(false);
				let end = buffer.indexOf("\n");
				while (end >= 0) {
					const line = buffer.slice(0, end);
					buffer = buffer.slice(end + 1);
					try {
						const reply = JSON.parse(line);
						if (reply.id === 1) {
							const name = reply.result?.agentInfo?.name;
							finish(
								reply.result?.protocolVersion === 1 &&
									typeof name === "string" &&
									(agent === "grok" ? /grok/i : /cursor/i).test(name),
							);
							return;
						}
					} catch {
						/* CLI startup output can precede JSON-RPC. */
					}
					end = buffer.indexOf("\n");
				}
			});
			child.stdin.write(
				`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: "superset-setup", version: "1" } } })}\n`,
			);
		});
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
}
export function setupCandidates(
	agent: SetupAgent,
	env: NodeJS.ProcessEnv,
	home: string,
): string[] {
	const directories = (env.PATH ?? "")
		.split(delimiter)
		.filter((dir) => dir && dir !== getBinDir());
	const candidates = directories.map((dir) => join(dir, agent));
	candidates.push(
		agent === "grok"
			? join(home, ".grok/bin/grok")
			: join(home, ".local/bin/cursor-agent"),
	);
	if (agent === "cursor-agent")
		candidates.push(
			join(home, ".local/bin/agent"),
			...directories.map((dir) => join(dir, "agent")),
		);
	return [...new Set(candidates)].filter(isAbsolute);
}
async function executable(file: string): Promise<boolean> {
	try {
		if (!(await stat(file)).isFile()) return false;
		await access(file, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}
export function grokSetupAuth(
	config: string | null,
	auth: string | null,
	env: NodeJS.ProcessEnv,
	now = Date.now(),
): SetupProbe["auth"] {
	if (/\b(?:api_key|env_key)["']?\s*=/.test(config ?? "") || env.XAI_API_KEY)
		return "api";
	if (!auth) return "missing";
	try {
		const entries = Object.values(JSON.parse(auth));
		for (const value of entries) {
			if (!value || typeof value !== "object") continue;
			const entry = value as { key?: unknown; expires_at?: unknown };
			if (typeof entry.key !== "string" || !entry.key) continue;
			const numeric =
				typeof entry.expires_at === "string" ? Number(entry.expires_at) : NaN;
			const expiry =
				typeof entry.expires_at === "number"
					? entry.expires_at < 1e12
						? entry.expires_at * 1000
						: entry.expires_at
					: typeof entry.expires_at === "string"
						? Number.isFinite(numeric)
							? numeric < 1e12
								? numeric * 1000
								: numeric
							: Date.parse(entry.expires_at)
						: Infinity;
			if (expiry > now) return "login";
		}
		return "missing";
	} catch {
		return "unknown";
	}
}
export async function inspectAgentSetup(
	agent: SetupAgent,
	env: NodeJS.ProcessEnv,
	dependencies = {
		home: homedir(),
		executable,
		run: runSetupCommand,
		chat: probeSetupChat,
		read: readSetupFile,
	},
): Promise<SetupProbe> {
	const missing: SetupProbe = {
		command: null,
		version: null,
		chat: false,
		auth: "unknown",
		model: null,
		modelOverrides: false,
	};
	let attempts = 0;
	for (const command of setupCandidates(agent, env, dependencies.home).slice(
		0,
		64,
	)) {
		if (!(await dependencies.executable(command))) continue;
		if (++attempts > 3) break;
		const help = await dependencies.run(command, ["--help"], env);
		if (
			!help ||
			!(agent === "grok" ? /Usage:\s*grok\b/i : /Cursor Agent/i).test(help)
		)
			continue;
		const prefix =
			agent === "grok" && help.includes("--no-auto-update")
				? ["--no-auto-update"]
				: [];
		const versionOutput = await dependencies.run(
			command,
			[...prefix, "--version"],
			env,
		);
		const version =
			versionOutput?.match(
				/\b(?:\d{4}\.\d{2}\.\d{2}(?:-[a-zA-Z0-9]+)?|\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?)\b/,
			)?.[0] ?? null;
		const chat = await dependencies.chat(command, agent, env, prefix);
		if (agent === "grok") {
			const dir = env.GROK_HOME || join(dependencies.home, ".grok");
			const config = await dependencies.read(join(dir, "config.toml"));
			const auth = await dependencies.read(join(dir, "auth.json"));
			const model = config ? grokDefaultModel(config) : null;
			return {
				command,
				version,
				chat,
				auth: grokSetupAuth(config, auth, env),
				model,
				modelOverrides:
					/\b(?:api_key|env_key|base_url|models_base_url|models_list_url)["']?\s*=/.test(
						config ?? "",
					),
			};
		}
		const status = await dependencies.run(command, ["status"], env);
		const auth =
			env.CURSOR_API_KEY || env.CURSOR_AUTH_TOKEN
				? "api"
				: status &&
						/(?:not logged in|not authenticated|logged out)/i.test(status)
					? "missing"
					: status && /(?:logged in|authenticated as)/i.test(status)
						? "login"
						: "unknown";
		return {
			command,
			version,
			chat,
			auth,
			model: null,
			modelOverrides: false,
		};
	}
	return missing;
}
