import { execFile } from "node:child_process";
import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { promisify } from "node:util";
import { getBinDir } from "@superset/agent-setup";
import { eq } from "drizzle-orm";
import { coerce, gt } from "semver";
import { forkAgentCliSettings, forkAgentCliUpdates } from "../db/fork-schema";
import { getTerminalBaseEnv } from "../terminal/env";
import type { HostServiceContext } from "../types";

const run = promisify(execFile);
type Ctx = Pick<HostServiceContext, "db">;

export const FORK_AGENT_CLI_DAY_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 60 * 60 * 1000;
const VERSION_TIMEOUT_MS = 10_000;
const UPDATE_TIMEOUT_MS = 5 * 60 * 1000;
const SETTINGS_SCOPE = "host";

export type ForkAgentCliId = "claude" | "codex";

interface Spec {
	id: ForkAgentCliId;
	label: string;
	binary: string;
	npmPackage: string;
	/** The command that updates this install, or null when the app cannot tell how it was installed. */
	update: (installPath: string) => { command: string; args: string[] } | null;
}

const SPECS: Spec[] = [
	{
		id: "claude",
		label: "Claude Code",
		binary: "claude",
		npmPackage: "@anthropic-ai/claude-code",
		update: (installPath) => ({ command: installPath, args: ["update"] }),
	},
	{
		id: "codex",
		label: "Codex",
		binary: "codex",
		npmPackage: "@openai/codex",
		update: (installPath) => {
			if (!resolved(installPath).includes("node_modules")) return null;
			return {
				command: join(dirname(installPath), "npm"),
				args: ["install", "-g", "@openai/codex@latest"],
			};
		},
	},
];

export const FORK_AGENT_CLI_IDS = SPECS.map((spec) => spec.id) as [
	ForkAgentCliId,
	...ForkAgentCliId[],
];

export interface ForkAgentCliDeps {
	now: () => number;
	/** Path of the binary on the PATH, not the app's own wrapper. */
	find: (binary: string) => string | null;
	run: (
		command: string,
		args: string[],
		timeoutMs: number,
	) => Promise<{ stdout: string; stderr: string }>;
	latest: (npmPackage: string) => Promise<string | null>;
}

export interface ForkAgentCliStatus {
	id: ForkAgentCliId;
	label: string;
	installed: string | null;
	latest: string | null;
	newer: boolean;
	/** The command the update runs, shown before it runs. */
	command: string | null;
	snoozed: boolean;
}

/** Where a link on the PATH really points, to tell an npm install from another. */
function resolved(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return path;
	}
}

function isExecutable(path: string): boolean {
	try {
		if (!statSync(path).isFile()) return false;
		accessSync(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

function realBinary(binary: string): string | null {
	const wrapperDir = process.platform === "win32" ? null : getBinDir();
	const base = getTerminalBaseEnv();
	const path = [
		base.PATH ?? process.env.PATH ?? "",
		join(homedir(), ".local", "bin"),
		"/opt/homebrew/bin",
		"/usr/local/bin",
	].join(delimiter);
	for (const dir of path.split(delimiter)) {
		if (!dir || dir === wrapperDir) continue;
		const candidate = join(dir, binary);
		if (isExecutable(candidate)) return candidate;
	}
	return null;
}

export function forkAgentCliDeps(): ForkAgentCliDeps {
	return {
		now: () => Date.now(),
		find: realBinary,
		run: async (command, args, timeoutMs) => {
			const result = await run(command, args, {
				env: { ...process.env, ...getTerminalBaseEnv() },
				timeout: timeoutMs,
				maxBuffer: 1024 * 1024,
			});
			return { stdout: result.stdout, stderr: result.stderr };
		},
		latest: async (npmPackage) => {
			try {
				const response = await fetch(
					`https://registry.npmjs.org/${npmPackage.replace("/", "%2F")}/latest`,
					{ signal: AbortSignal.timeout(VERSION_TIMEOUT_MS) },
				);
				if (!response.ok) return null;
				const body = (await response.json()) as { version?: unknown };
				return typeof body.version === "string" ? body.version : null;
			} catch {
				return null;
			}
		},
	};
}

function parseVersion(output: string): string | null {
	return output.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/)?.[0] ?? null;
}

async function installedVersion(
	deps: ForkAgentCliDeps,
	path: string,
): Promise<string | null> {
	try {
		const { stdout, stderr } = await deps.run(
			path,
			["--version"],
			VERSION_TIMEOUT_MS,
		);
		return parseVersion(stdout) ?? parseVersion(stderr);
	} catch {
		return null;
	}
}

export function forkAgentCliChecksEnabled(ctx: Ctx): boolean {
	return (
		ctx.db
			.select()
			.from(forkAgentCliSettings)
			.where(eq(forkAgentCliSettings.scope, SETTINGS_SCOPE))
			.get()?.enabled ?? true
	);
}

export function forkSetAgentCliChecks(ctx: Ctx, enabled: boolean): void {
	ctx.db
		.insert(forkAgentCliSettings)
		.values({ scope: SETTINGS_SCOPE, enabled })
		.onConflictDoUpdate({
			target: forkAgentCliSettings.scope,
			set: { enabled },
		})
		.run();
}

function saved(ctx: Ctx, agent: string) {
	return ctx.db
		.select()
		.from(forkAgentCliUpdates)
		.where(eq(forkAgentCliUpdates.agent, agent))
		.get();
}

function save(
	ctx: Ctx,
	agent: string,
	values: { checkedAt: number; latest: string | null },
): void {
	ctx.db
		.insert(forkAgentCliUpdates)
		.values({ agent, ...values })
		.onConflictDoUpdate({
			target: forkAgentCliUpdates.agent,
			set: values,
		})
		.run();
}

export function forkAgentCliIsNewer(
	installed: string | null,
	latest: string | null,
): boolean {
	const a = coerce(installed);
	const b = coerce(latest);
	return Boolean(a && b && gt(b, a));
}

async function statusOf(
	ctx: Ctx,
	deps: ForkAgentCliDeps,
	spec: Spec,
	force: boolean,
): Promise<ForkAgentCliStatus> {
	const now = deps.now();
	const path = deps.find(spec.binary);
	let row = saved(ctx, spec.id);
	if (path && (force || !row || now - row.checkedAt >= FORK_AGENT_CLI_DAY_MS)) {
		const latest = await deps.latest(spec.npmPackage);
		save(ctx, spec.id, {
			// A failed check tries again within the hour, not on every call.
			checkedAt: latest
				? now
				: now - FORK_AGENT_CLI_DAY_MS + RETRY_AFTER_FAILURE_MS,
			latest: latest ?? row?.latest ?? null,
		});
		row = saved(ctx, spec.id);
	}
	const installed = path ? await installedVersion(deps, path) : null;
	const latest = row?.latest ?? null;
	const update = path ? spec.update(path) : null;
	return {
		id: spec.id,
		label: spec.label,
		installed,
		latest,
		newer: forkAgentCliIsNewer(installed, latest),
		command: update ? [update.command, ...update.args].join(" ") : null,
		snoozed: (row?.snoozedUntil ?? 0) > now,
	};
}

/** One entry per supported agent. The network is read at most once a day, unless forced. */
export async function forkAgentCliStatuses(
	ctx: Ctx,
	deps: ForkAgentCliDeps,
	options: { force?: boolean } = {},
): Promise<ForkAgentCliStatus[]> {
	return Promise.all(
		SPECS.map((spec) => statusOf(ctx, deps, spec, options.force === true)),
	);
}

/** "Later" hides the notice until the next daily check. */
export function forkSnoozeAgentCliUpdates(ctx: Ctx, now: number): void {
	for (const spec of SPECS) {
		const row = saved(ctx, spec.id);
		if (!row) continue;
		ctx.db
			.update(forkAgentCliUpdates)
			.set({ snoozedUntil: now + FORK_AGENT_CLI_DAY_MS })
			.where(eq(forkAgentCliUpdates.agent, spec.id))
			.run();
	}
}

const updating = new Set<ForkAgentCliId>();

export async function forkUpdateAgentCli(
	ctx: Ctx,
	deps: ForkAgentCliDeps,
	id: ForkAgentCliId,
): Promise<ForkAgentCliStatus> {
	const spec = SPECS.find((entry) => entry.id === id);
	if (!spec) throw new Error("Unknown agent");
	if (updating.has(id)) throw new Error(`${spec.label} is already updating`);
	const path = deps.find(spec.binary);
	if (!path) throw new Error(`${spec.label} is not installed on this computer`);
	const update = spec.update(path);
	if (!update)
		throw new Error(
			`Paradev++ cannot tell how ${spec.label} was installed. Update it with the same tool you used to install it.`,
		);
	updating.add(id);
	try {
		try {
			await deps.run(update.command, update.args, UPDATE_TIMEOUT_MS);
		} catch (error) {
			const detail =
				error instanceof Error ? error.message.split("\n")[0] : String(error);
			throw new Error(`${spec.label} did not update: ${detail}`);
		}
	} finally {
		updating.delete(id);
	}
	const after = await statusOf(ctx, deps, spec, true);
	if (after.newer)
		throw new Error(
			`${spec.label} is still ${after.installed ?? "unknown"}. Run "${after.command ?? spec.binary}" in a terminal to see why.`,
		);
	return after;
}
