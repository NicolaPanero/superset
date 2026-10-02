import { execFile } from "node:child_process";
import { accessSync, constants, existsSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { getBinDir, resolveSupersetHomeDir } from "@superset/agent-setup";
import { coerce, gte } from "semver";
import { getTerminalBaseEnv, waitForTerminalBaseEnv } from "../terminal/env";

const execFileAsync = promisify(execFile);

const VERSION_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60_000;
const UNGATED = "0.0.0";

export type AgentCli = {
	command: string;
	env: NodeJS.ProcessEnv;
};

function isExecutableFile(path: string): boolean {
	try {
		if (!statSync(path).isFile()) return false;
		accessSync(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

function findOnPath(binary: string, env: NodeJS.ProcessEnv): string | null {
	const names =
		process.platform === "win32"
			? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
					.split(";")
					.filter(Boolean)
					.map((ext) => binary + ext.toLowerCase())
			: [binary];
	for (const dir of (env.PATH ?? "").split(delimiter)) {
		if (!dir) continue;
		for (const name of names) {
			if (isExecutableFile(join(dir, name))) return join(dir, name);
		}
	}
	return null;
}

function supersetWrapper(binary: string): string | null {
	if (process.platform === "win32") return null;
	const wrapper = join(getBinDir(), binary);
	return existsSync(wrapper) ? wrapper : null;
}

export function agentCliCommand(
	binary: string,
	env: NodeJS.ProcessEnv,
): string {
	return supersetWrapper(binary) ?? findOnPath(binary, env) ?? binary;
}

function agentEnv(): NodeJS.ProcessEnv {
	const base = getTerminalBaseEnv();
	const binDir = getBinDir();
	const path = (base.PATH ?? "").split(delimiter).filter(Boolean);
	return {
		...base,
		SUPERSET_HOME_DIR: resolveSupersetHomeDir(),
		PATH: [binDir, ...path.filter((entry) => entry !== binDir)].join(delimiter),
	};
}

const cache = new Map<string, { at: number; version: string | null }>();

function parseVersion(output: string): string | null {
	return output.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/)?.[0] ?? null;
}

async function probeVersion(
	command: string,
	env: NodeJS.ProcessEnv,
): Promise<string | null> {
	const hit = cache.get(command);
	if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.version;
	let version: string | null = null;
	try {
		const { stdout, stderr } = await execFileAsync(command, ["--version"], {
			env,
			timeout: VERSION_TIMEOUT_MS,
		});
		version = parseVersion(stdout) ?? parseVersion(stderr);
	} catch {
		version = null;
	}
	cache.set(command, { at: Date.now(), version });
	return version;
}

export function clearAgentCliCache(): void {
	cache.clear();
}

export function agentCliUnsupported(options: {
	binary: string;
	minVersion: string;
	found: string | null;
	upgrade?: string;
}): string {
	const upgrade = options.upgrade ? ` Upgrade with: ${options.upgrade}` : "";
	const wanted =
		UNGATED === options.minVersion ? "" : ` ${options.minVersion} or newer`;
	if (!options.found) {
		return (
			`${options.binary} was not found, so this chat cannot start. Install` +
			` ${options.binary}${wanted} and make sure it is on your PATH.${upgrade}`
		);
	}
	return `${options.binary} ${options.minVersion} or newer is needed for chat, and ${options.found} is installed.${upgrade}`;
}

function meetsFloor(found: string, minVersion: string): boolean {
	if (minVersion === UNGATED) return true;
	const coerced = coerce(found);
	return !coerced || gte(coerced, minVersion);
}

export async function resolveAgentCli(options: {
	binary: string;
	minVersion: string;
	upgrade?: string;
}): Promise<AgentCli> {
	await waitForTerminalBaseEnv();
	const env = agentEnv();
	const command = agentCliCommand(options.binary, env);
	const found = await probeVersion(command, env);
	if (!found || !meetsFloor(found, options.minVersion)) {
		throw new Error(agentCliUnsupported({ ...options, found }));
	}
	return { command, env };
}

export function resolveAgentCliSync(binary: string): AgentCli {
	const env = agentEnv();
	return { command: agentCliCommand(binary, env), env };
}
