import { execFile } from "node:child_process";
import { accessSync, constants, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { getWrapperPath } from "@superset/agent-setup";
import { coerce, gte } from "semver";
import {
	getToolEnvironment,
	toolEnvironmentSync,
} from "../terminal/clean-shell-env";

const execFileAsync = promisify(execFile);

const VERSION_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60_000;

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
	for (const dir of (env.PATH ?? "").split(":")) {
		if (dir && isExecutableFile(join(dir, binary))) return join(dir, binary);
	}
	return null;
}

/**
 * How a Superset terminal reaches an agent: the `~/.superset/bin` wrapper when
 * `setupAgentIntegrations` has provisioned one, because that is what applies
 * the user's selected account and the managed hooks. Otherwise the install
 * itself, resolved to an absolute path — a GUI-launched app inherits launchd's
 * bare PATH, so a bare name is not a command this process can find.
 */
export function agentCliCommand(
	binary: string,
	env: NodeJS.ProcessEnv,
): string {
	const wrapper = getWrapperPath(binary);
	if (existsSync(wrapper)) return wrapper;
	return findOnPath(binary, env) ?? binary;
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
		// Absent, not executable, or broken past launching. One outcome, because
		// the reader's next step is the same for all three.
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
	if (!options.found) {
		return (
			`${options.binary} was not found, so this chat cannot start. Install` +
			` ${options.binary} ${options.minVersion} or newer and make sure it is on your PATH.${upgrade}`
		);
	}
	return `${options.binary} ${options.minVersion} or newer is needed for chat, and ${options.found} is installed.${upgrade}`;
}

/**
 * Checks a version against a floor. Anything unparseable passes: the floors are
 * a guard against a CLI too old to speak the protocol, not a gate on people
 * running builds from source.
 */
function meetsFloor(found: string, minVersion: string): boolean {
	const coerced = coerce(found);
	return !coerced || gte(coerced, minVersion);
}

/**
 * The agent CLI the user has installed, or a throw naming what they need. The
 * env is their login shell's, so chat resolves the same binaries and auth the
 * terminal does.
 */
export async function resolveAgentCli(options: {
	binary: string;
	minVersion: string;
	upgrade?: string;
}): Promise<AgentCli> {
	const env = await getToolEnvironment();
	const command = agentCliCommand(options.binary, env);
	const found = await probeVersion(command, env);
	if (!found || !meetsFloor(found, options.minVersion)) {
		throw new Error(agentCliUnsupported({ ...options, found }));
	}
	return { command, env };
}

/**
 * The same resolution for a harness whose `start` cannot await. No version
 * check, because probing spawns a process: an unsupported CLI surfaces as the
 * agent's own launch failure rather than as this message.
 */
export function resolveAgentCliSync(binary: string): AgentCli {
	const env = toolEnvironmentSync();
	return { command: agentCliCommand(binary, env), env };
}
