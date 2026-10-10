import { and, eq, gte } from "drizzle-orm";
import type { HostDb } from "../db";
import { chatQuotaRecovery } from "../db/fork-schema";

export type RecoverySettings = {
	switchAccounts: boolean;
	resumeAtReset: boolean;
};
export type RecoveryStatus = {
	phase: "idle" | "switching" | "waiting" | "stopped";
	nextCheckAt?: number;
	accountLabel?: string;
};
export const recoveryControllers = new Map<
	string,
	{ status: RecoveryStatus; changed(): void }
>();
export const recoveryKey = (workspaceId: string, terminalId: string) =>
	`${workspaceId}:${terminalId}`;
export function readRecovery(
	db: HostDb,
	workspaceId: string,
	terminalId: string,
) {
	return db
		.select()
		.from(chatQuotaRecovery)
		.where(
			and(
				eq(chatQuotaRecovery.workspaceId, workspaceId),
				eq(chatQuotaRecovery.terminalId, terminalId),
				gte(chatQuotaRecovery.updatedAt, Date.now() - 30 * 24 * 60 * 60_000),
			),
		)
		.get();
}
export function writeRecovery(
	db: HostDb,
	workspaceId: string,
	terminalId: string,
	patch: Partial<RecoverySettings> & {
		hasSelection?: boolean;
		nativeSessionId?: string | null;
		accountSelection?: string | null;
	},
) {
	const row = readRecovery(db, workspaceId, terminalId);
	const values = {
		workspaceId,
		terminalId,
		switchAccounts: row?.switchAccounts ?? false,
		resumeAtReset: row?.resumeAtReset ?? false,
		hasSelection: row?.hasSelection ?? false,
		nativeSessionId: row?.nativeSessionId ?? null,
		accountSelection: row?.accountSelection ?? null,
		...patch,
		updatedAt: Date.now(),
	};
	db.insert(chatQuotaRecovery)
		.values(values)
		.onConflictDoUpdate({
			target: [chatQuotaRecovery.workspaceId, chatQuotaRecovery.terminalId],
			set: values,
		})
		.run();
	// Closed panes can outlive their tabs. Bound retention independently of UI cleanup.
	db.$client
		.prepare(
			"DELETE FROM chat_quota_recovery WHERE updated_at < ? OR rowid IN (SELECT rowid FROM chat_quota_recovery ORDER BY updated_at DESC LIMIT -1 OFFSET 1024)",
		)
		.run(Date.now() - 30 * 24 * 60 * 60_000);
}
