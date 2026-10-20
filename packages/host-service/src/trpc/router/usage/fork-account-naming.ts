import { execFile } from "node:child_process";
import { lstat, mkdir, readFile, rename, rmdir } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import {
	forkAccountRegistry,
	type IsolatedAccount,
} from "./fork-account-registry";
import { independentProfile } from "./fork-profile-directory";
import {
	keychainServicesForConfigDir,
	readApiBillingFingerprint,
} from "./profiles";
import { readAccountIdentity } from "./session-account/session-account";

const execFileAsync = promisify(execFile);
export const FORK_LOGIN_MARKER = ".superset-login-complete";
const LOGIN_ID =
	/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export function accountProfileSlug(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 100)
		.replace(/-+$/g, "");
}

export function pendingAccountSelection(
	home: string,
	agent: IsolatedAccount["agent"],
	id: string,
) {
	if (!LOGIN_ID.test(id)) throw new Error("account_login_invalid");
	return join(home, `.${agent}-superset-login-${id}`);
}

export function isPendingAccountSelection(selection: string) {
	return /^\.(claude|codex)-superset-login-[a-f0-9-]{36}$/.test(
		basename(selection),
	);
}

// SecItemUpdate preserves the existing password and access permissions. Claude
// hashes CLAUDE_CONFIG_DIR, so a directory rename alone loses its scoped login.
export function keychainRetargetScript(
	pairs: Array<readonly [string, string]>,
) {
	return `ObjC.import("Security");
var pairs = ${JSON.stringify(pairs)};
var changed = [], status = 0;
for (var i = 0; i < pairs.length; i++) {
  var pair = pairs[i];
  status = Number($.SecItemUpdate($({class: "genp", svce: pair[0]}), $({svce: pair[1]})));
  if (status === 0) changed.push(pair);
  else if (status !== -25300) break;
}
var ok = status === 0 || status === -25300;
var rollback = true;
if (!ok) {
  for (var j = changed.length - 1; j >= 0; j--) {
    var undo = changed[j];
    if (Number($.SecItemUpdate($({class: "genp", svce: undo[1]}), $({svce: undo[0]})))) rollback = false;
  }
}
JSON.stringify({ok: ok, rollback: rollback, changed: ok ? changed.length : 0});`;
}

export async function retargetClaudeKeychain(from: string, to: string) {
	if (platform() !== "darwin") return;
	const sources = keychainServicesForConfigDir(from);
	const targets = keychainServicesForConfigDir(to);
	const pairs = sources.map(
		(service, i) => [service, targets[i] as string] as const,
	);
	const { stdout } = await execFileAsync(
		"/usr/bin/osascript",
		["-l", "JavaScript", "-e", keychainRetargetScript(pairs)],
		{ timeout: 15_000 },
	);
	const result = JSON.parse(stdout.trim()) as {
		ok: boolean;
		rollback: boolean;
	};
	if (!result.ok)
		throw new Error(
			result.rollback
				? "account_keychain_unavailable"
				: "account_keychain_rollback_required",
		);
}

const dependencies = () => ({
	home: homedir(),
	registry: forkAccountRegistry(),
	identity: readAccountIdentity,
	independent: independentProfile,
	keychain: retargetClaudeKeychain,
});

export async function nameForkAccountProfile(
	input: {
		agent: IsolatedAccount["agent"];
		selection: string;
		credentialKind: IsolatedAccount["credentialKind"];
		loginId?: string;
	},
	deps = dependencies(),
) {
	const { agent, selection, credentialKind, loginId } = input;
	if (
		dirname(selection) !== deps.home ||
		!basename(selection).startsWith(`.${agent}-`) ||
		!(await lstat(selection)).isDirectory() ||
		!(await deps.independent(agent, selection))
	)
		throw new Error("account_login_invalid");
	const api = await readApiBillingFingerprint(selection, agent);
	if (Boolean(api) !== (credentialKind === "api_key"))
		throw new Error("account_login_invalid");
	const identity =
		credentialKind === "subscription"
			? await deps.identity(agent, selection)
			: null;
	if (credentialKind === "subscription" && !identity)
		throw new Error("account_login_incomplete");
	const saved = deps.registry
		.list()
		.find((row) => row.agent === agent && row.selection === selection);
	if (
		saved &&
		(saved.identity !== (identity?.identity ?? null) ||
			saved.credentialKind !== credentialKind)
	)
		throw new Error("account_login_identity_changed");
	const slug =
		accountProfileSlug(identity?.email ?? "") ||
		`api-${loginId?.slice(0, 8) ?? "account"}`;
	let destination: string | null = null;
	for (let suffix = 1; suffix <= 128; suffix++) {
		const candidate = join(
			deps.home,
			`.${agent}-${slug}${suffix === 1 ? "" : `-${suffix}`}`,
		);
		if (candidate === selection)
			return {
				selection,
				label: identity?.email ?? basename(selection),
				credentialKind,
			};
		if (deps.registry.list().some((row) => row.selection === candidate))
			continue;
		try {
			await mkdir(candidate, { mode: 0o700 });
			destination = candidate;
			break;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		}
	}
	if (!destination) throw new Error("account_profile_name_unavailable");
	let moved = false,
		keychainMoved = false;
	try {
		if (agent === "claude") {
			await deps.keychain(selection, destination);
			keychainMoved = true;
		}
		await rename(selection, destination);
		moved = true;
		const current =
			credentialKind === "subscription"
				? await deps.identity(agent, destination)
				: null;
		if (current?.identity !== identity?.identity)
			throw new Error("account_login_identity_changed");
		const account: IsolatedAccount = {
			agent,
			selection: destination,
			credentialKind,
			identity: identity?.identity ?? null,
			email: identity?.email ?? null,
		};
		deps.registry.remember(account);
		if (saved) deps.registry.forget(agent, selection);
		return {
			selection: destination,
			label: account.email ?? basename(destination),
			credentialKind,
		};
	} catch (error) {
		deps.registry.forget(agent, destination);
		if (moved) await rename(destination, selection);
		if (keychainMoved) await deps.keychain(destination, selection);
		await rmdir(destination).catch((error) => {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		});
		throw error;
	}
}

const pending = new Map<
	string,
	Promise<Awaited<ReturnType<typeof nameForkAccountProfile>> | null>
>();
export async function finishForkAccountLogin(
	input: {
		agent: IsolatedAccount["agent"];
		credentialKind: IsolatedAccount["credentialKind"];
		loginId: string;
	},
	deps = dependencies(),
) {
	const source = pendingAccountSelection(deps.home, input.agent, input.loginId);
	const key = JSON.stringify([
		deps.home,
		input.agent,
		input.credentialKind,
		input.loginId,
	]);
	const existing = pending.get(key);
	if (existing) return existing;
	if (pending.size >= 128) throw new Error("account_login_limit");
	const job = (async () => {
		const receipt = `${input.agent}:superset-login-${input.loginId}`;
		const rows = deps.registry
			.list()
			.filter((row) => row.agent === input.agent);
		const markers = await Promise.all(
			rows.map(async (row) => {
				try {
					const file = join(row.selection, FORK_LOGIN_MARKER);
					const info = await lstat(file);
					if (!info.isFile() || info.size > 64) return null;
					return (await readFile(file, "utf8")).trim();
				} catch {
					return null;
				}
			}),
		);
		const completed = rows.find((_row, i) => markers[i] === receipt);
		if (completed) {
			if (
				completed.credentialKind !== input.credentialKind ||
				!(await deps.independent(input.agent, completed.selection))
			)
				throw new Error("account_login_invalid");
			if (
				completed.credentialKind === "subscription" &&
				(await deps.identity(input.agent, completed.selection))?.identity !==
					completed.identity
			)
				throw new Error("account_login_identity_changed");
			return {
				selection: completed.selection,
				label: completed.email ?? basename(completed.selection),
				credentialKind: completed.credentialKind,
			};
		}
		try {
			const marker = join(source, FORK_LOGIN_MARKER);
			const info = await lstat(marker);
			if (
				!info.isFile() ||
				info.size > 64 ||
				(await readFile(marker, "utf8")).trim() !== receipt
			)
				throw new Error("account_login_invalid");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
			throw error;
		}
		return nameForkAccountProfile({ ...input, selection: source }, deps);
	})();
	pending.set(key, job);
	try {
		return await job;
	} finally {
		pending.delete(key);
	}
}
