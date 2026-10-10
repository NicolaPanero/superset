import { homedir } from "node:os";
import { join } from "node:path";
import type {
	HarnessAdapter,
	HarnessFactoryOptions,
} from "@superset/chat-runtime";
import type { HostDb } from "../db";
import { agentAccountOptions } from "../trpc/router/agents/account-selection";
import { getQuota } from "../trpc/router/usage/fork-quota-cache";
import {
	type SessionAccount,
	validateSessionAccount,
} from "../trpc/router/usage/session-account/session-account";
import { moveClaudeSession } from "./forkMoveClaudeSession";
import { ForkQuotaRecoveryAdapter } from "./forkQuotaRecoveryAdapter";
import {
	type RecoveryStatus,
	readRecovery,
	recoveryControllers,
	recoveryKey,
	writeRecovery,
} from "./forkQuotaRecoveryStore";

export function forkQuotaRecoveryHarness(
	db: HostDb,
	harness: string,
	options: HarnessFactoryOptions,
	worker: (
		selection: string | null | undefined,
		captured: (account: SessionAccount) => void,
	) => HarnessAdapter,
): HarnessAdapter {
	if (harness !== "claude-acp" || !options.terminalId)
		return worker(options.accountSelection, () => {});
	let account: SessionAccount | undefined;
	const create = (selection: string | null | undefined) =>
		worker(selection, (value) => {
			account = value;
		});
	const saved = readRecovery(db, options.scopeId, options.terminalId);
	const initial =
		saved?.hasSelection &&
		saved.nativeSessionId === options.resume?.harnessSessionId
			? saved.accountSelection
			: options.accountSelection;
	const terminalId = options.terminalId,
		key = recoveryKey(options.scopeId, terminalId);
	const controller = {
		status: { phase: "idle" } as RecoveryStatus,
		changed: () => adapter.changed(),
	};
	const adapter = new ForkQuotaRecoveryAdapter(
		{
			create,
			settings: () =>
				readRecovery(db, options.scopeId, terminalId) ?? {
					switchAccounts: false,
					resumeAtReset: false,
				},
			account: () => account,
			validate: async () =>
				!!account && (await validateSessionAccount(account)),
			quota: () => getQuota(true),
			move: async (sessionId, selection) => {
				if (!account || !(await validateSessionAccount(account)))
					throw new Error("source_account_unverified");
				const dirs = await agentAccountOptions("claude");
				if (!dirs.some((d) => d.selection === selection))
					throw new Error("account_selection_unavailable");
				const systemDir = join(homedir(), ".claude");
				const result = await moveClaudeSession({
					sessionId,
					configDirs: dirs.map((d) => d.selection ?? systemDir),
					targetDir: selection ?? systemDir,
				});
				if (!result.moved && result.reason === "session_not_found")
					throw new Error("session_not_found");
			},
			selected: (selection, nativeSessionId) =>
				writeRecovery(db, options.scopeId, terminalId, {
					hasSelection: true,
					nativeSessionId,
					accountSelection: selection,
				}),
			status: (status) => {
				controller.status = status;
			},
			onDispose: () => {
				if (recoveryControllers.get(key) === controller)
					recoveryControllers.delete(key);
			},
		},
		initial,
	);
	recoveryControllers.set(key, controller);
	return adapter;
}
