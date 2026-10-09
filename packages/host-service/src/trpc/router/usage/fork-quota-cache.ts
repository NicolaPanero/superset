import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveSupersetHomeDir } from "@superset/agent-setup";
import { fetchAgyAccounts } from "./agy-quota";
import { fetchClaudeAccounts } from "./claude";
import { fetchCodexAccounts } from "./codex";
import { fetchGrokAccounts } from "./grok-quota";
import { fetchOpencodeAccounts } from "./opencode-quota";
import type { UsageAccount } from "./types";

const TTL = 5 * 60_000;
const MAX_AGE = 24 * 60 * 60_000;
let cached: { at: number; promise: Promise<UsageAccount[]> } | undefined;
let inFlight: Promise<UsageAccount[]> | undefined;
const lastSuccess = new Map<string, UsageAccount>();
let restored = false;
const key = (account: UsageAccount) =>
	`${account.agent}:${account.selection ?? ""}:${account.credentialKind}:${account.accountKey}`;
const file = () =>
	join(resolveSupersetHomeDir(), "fork", "quota-last-success.json");

export function reconcileQuota(
	accounts: UsageAccount[],
	snapshots: Map<string, UsageAccount>,
	now = Date.now(),
) {
	const live = new Set(accounts.slice(0, 128).map(key));
	for (const [id, sample] of snapshots)
		if (!live.has(id) || now - sample.fetchedAt.getTime() >= MAX_AGE)
			snapshots.delete(id);
	return accounts.slice(0, 128).map((account) => {
		const id = key(account),
			previous = snapshots.get(id);
		const sameIdentity =
			previous &&
			!!account.identityFingerprint &&
			account.identityFingerprint === previous.identityFingerprint &&
			(!account.email || account.email === previous.email);
		if (
			account.status === "ok" &&
			account.windows.length &&
			now - account.fetchedAt.getTime() < MAX_AGE
		) {
			snapshots.set(id, account);
			return { ...account, lastSuccessfulAt: account.fetchedAt };
		}
		if (sameIdentity)
			return {
				...account,
				email: account.email ?? previous.email,
				windows: previous.windows,
				extraUsage: previous.extraUsage,
				creditsBalance: previous.creditsBalance,
				fetchedAt: previous.fetchedAt,
				lastSuccessfulAt: previous.fetchedAt,
			};
		snapshots.delete(id);
		return account;
	});
}

async function load() {
	if (!restored) {
		restored = true;
		try {
			const rows = JSON.parse(await readFile(file(), "utf8")) as UsageAccount[];
			for (const row of rows.slice(0, 128)) {
				row.fetchedAt = new Date(row.fetchedAt);
				row.windows = row.windows.map((w) => ({
					...w,
					resetsAt: w.resetsAt ? new Date(w.resetsAt) : null,
				}));
				if (Date.now() - row.fetchedAt.getTime() < MAX_AGE)
					lastSuccess.set(key(row), row);
			}
		} catch {
			/* A missing snapshot needs no recovery. */
		}
	}
	const accounts = (
		await Promise.all([
			fetchClaudeAccounts(),
			fetchCodexAccounts(),
			fetchGrokAccounts(),
			fetchAgyAccounts(),
			fetchOpencodeAccounts(),
		])
	).flat();
	const result = reconcileQuota(accounts, lastSuccess);
	try {
		await mkdir(join(resolveSupersetHomeDir(), "fork"), {
			recursive: true,
			mode: 0o700,
		});
		await writeFile(
			`${file()}.tmp`,
			JSON.stringify([...lastSuccess.values()]),
			{ mode: 0o600 },
		);
		await rename(`${file()}.tmp`, file());
	} catch {
		/* Memory remains available if the host cannot write its cache. */
	}
	return result;
}

export function invalidateQuota() {
	cached = undefined;
}
export function getQuota(forceRefresh = false) {
	if (inFlight) return inFlight;
	if (!forceRefresh && cached && Date.now() - cached.at < TTL)
		return cached.promise;
	const promise = load();
	cached = { at: Date.now(), promise };
	inFlight = promise;
	promise.then(
		() => {
			inFlight = undefined;
		},
		() => {
			inFlight = undefined;
			cached = undefined;
		},
	);
	return promise;
}
