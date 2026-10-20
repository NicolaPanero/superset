import { accessSync, constants } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { resolveSupersetHomeDir } from "@superset/agent-setup";
import {
	CodexRpcClient,
	spawnCodexTransport,
} from "@superset/chat-runtime/fork-quota-rpc";
import { spawn as spawnPty } from "node-pty";
import {
	getTerminalBaseEnv,
	waitForTerminalBaseEnv,
} from "../../../terminal/env";
import { agentAccountOptions } from "../agents/account-selection";
import { getQuota, invalidateQuota } from "./fork-quota-cache";
import { discoverCodexHomes } from "./profiles";

const jobs = new Map<
	string,
	{
		at: number;
		pending: boolean;
		promise: Promise<{
			status: "checked" | "login_required" | "unavailable" | "retry_later";
		}>;
	}
>();
let active = 0;
const queue: Array<() => void> = [];

export async function withProbeSlot<T>(run: () => Promise<T>): Promise<T> {
	if (active >= 2) await new Promise<void>((resolve) => queue.push(resolve));
	else active++;
	try {
		return await run();
	} finally {
		const next = queue.shift();
		if (next) next();
		else active--;
	}
}

export function claudeProbe(
	cwd: string,
	env: Record<string, string>,
	timeoutMs = 15_000,
	spawn = spawnPty,
	inputDelayMs = 300,
) {
	return new Promise<void>((resolve, reject) => {
		const pty = spawn(
			"claude",
			[
				"--setting-sources",
				"",
				"--settings",
				JSON.stringify({
					disableAllHooks: true,
					remoteControlAtStartup: false,
					autoUpdates: false,
				}),
				"--strict-mcp-config",
				"--mcp-config",
				'{"mcpServers":{}}',
				"--tools",
				"",
				"--allowed-tools",
				"",
			],
			{ cwd, env, cols: 120, rows: 40, name: "xterm-256color" },
		);
		let inputTimer: ReturnType<typeof setTimeout> | undefined;
		const writeWhenReady = (value: string) => {
			inputTimer = setTimeout(() => {
				if (!done) pty.write(value);
			}, inputDelayMs);
		};
		let output = "",
			sent = false,
			trusted = false,
			done = false;
		const finish = (error?: Error) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			clearTimeout(inputTimer);
			pty.kill("SIGKILL");
			error ? reject(error) : resolve();
		};
		const timer = setTimeout(
			() => finish(new Error("probe_timeout")),
			timeoutMs,
		);
		pty.onData((chunk) => {
			output = (output + chunk)
				.slice(-65536)
				.replace(
					new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[a-zA-Z]`, "g"),
					"",
				);
			const compactOutput = output.replace(/\s/g, "");
			if (!trusted && /trustthisfolder|Yes,Itrust/i.test(compactOutput)) {
				trusted = true;
				writeWhenReady(/❯No,exit/i.test(compactOutput) ? "\x1b[B\r" : "\r");
				output = "";
				return;
			}
			if (!sent && /forshortcuts|Try"/.test(compactOutput)) {
				sent = true;
				writeWhenReady("/usage\r");
				output = "";
				return;
			}
			if (
				sent &&
				/Currentsession|Currentweek|Resets|Usagelimit/i.test(compactOutput)
			)
				finish();
			if (/Pleaselogin|Notloggedin|Run\/login/i.test(compactOutput))
				finish(new Error("probe_login_required"));
		});
		pty.onExit(() => finish(new Error("probe_exited")));
	});
}

async function codexProbe(cwd: string, env: Record<string, string>) {
	const command = (env.PATH ?? "")
		.split(delimiter)
		.map((dir) =>
			join(dir, process.platform === "win32" ? "codex.exe" : "codex"),
		)
		.find((file) => {
			try {
				accessSync(file, constants.X_OK);
				return true;
			} catch {
				return false;
			}
		});
	if (!command) throw new Error("probe_cli_unavailable");
	const client = new CodexRpcClient({
		createTransport: (handlers) =>
			spawnCodexTransport(
				{
					command,
					cwd,
					env,
					args: [
						"app-server",
						"--listen",
						"stdio://",
						"-c",
						"mcp_servers={}",
						"-c",
						"notify=[]",
					],
				},
				handlers,
			),
		onNotification: () => {},
		onServerRequest: () => {},
	});
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			(async () => {
				await client.initialize();
				await client.request("account/read", { refreshToken: true });
				await client.request("account/rateLimits/read");
			})(),
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error("probe_timeout")), 13_000);
			}),
		]);
	} finally {
		clearTimeout(timer);
		await client.close();
	}
}

export async function probeAccount(
	agent: "claude" | "codex",
	selection: string | null,
) {
	const options = await agentAccountOptions(agent);
	if (!options.some((option) => option.selection === selection))
		throw new Error("account_selection_unavailable");
	const id = `${agent}:${selection ?? ""}`,
		now = Date.now();
	for (const [key, job] of jobs)
		if (!job.pending && now - job.at >= 5 * 60_000) jobs.delete(key);
	const existing = jobs.get(id);
	if (existing) return existing.promise;
	if (jobs.size >= 128) return { status: "retry_later" as const };
	const promise = withProbeSlot(async () => {
		const job = jobs.get(id);
		if (job) job.at = Date.now();
		const account = (await getQuota()).find(
			(row) => row.agent === agent && row.selection === selection,
		);
		if (
			!account ||
			account.status === "signed_out" ||
			account.credentialKind !== "subscription"
		)
			return { status: "login_required" as const };
		if (account.retryAt && account.retryAt.getTime() > Date.now())
			return { status: "retry_later" as const };
		await waitForTerminalBaseEnv();
		const env = { ...getTerminalBaseEnv() };
		const keys = [
			"ANTHROPIC_API_KEY",
			"ANTHROPIC_AUTH_TOKEN",
			"CLAUDE_CODE_OAUTH_TOKEN",
			"OPENAI_API_KEY",
			"CODEX_API_KEY",
		];
		for (const key of keys) delete env[key];
		delete env.SUPERSET_HOOKS_DIR;
		if (agent === "claude") {
			env.SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR = "";
			env.SUPERSET_PINNED_ACCOUNT_ENV = "CLAUDE_CONFIG_DIR";
			if (selection) env.CLAUDE_CONFIG_DIR = selection;
			else delete env.CLAUDE_CONFIG_DIR;
		} else
			env.CODEX_HOME =
				selection ??
				(await discoverCodexHomes())[0]?.home ??
				join(homedir(), ".codex");
		const root = join(resolveSupersetHomeDir(), "fork", "usage-probes");
		await mkdir(root, { recursive: true, mode: 0o700 });
		const cwd = await mkdtemp(join(root, "probe-"));
		try {
			await (agent === "claude" ? claudeProbe(cwd, env) : codexProbe(cwd, env));
			invalidateQuota();
			return { status: "checked" as const };
		} catch (error) {
			return {
				status:
					error instanceof Error && error.message === "probe_login_required"
						? ("login_required" as const)
						: ("unavailable" as const),
			};
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});
	const job = { at: now, pending: true, promise };
	jobs.set(id, job);
	promise.then(
		() => {
			job.pending = false;
		},
		() => {
			job.pending = false;
		},
	);
	return promise;
}
