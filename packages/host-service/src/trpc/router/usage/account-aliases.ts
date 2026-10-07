import { and, count, eq } from "drizzle-orm";
import type { HostDb } from "../../../db";
import { agentAccountAliases } from "../../../db/fork-schema";

const MAX_ALIASES = 128;
type ManagedAgent = "claude" | "codex";

export function listAccountAliases(db: HostDb) {
	return db
		.select()
		.from(agentAccountAliases)
		.all()
		.map((row) => ({
			...row,
			selection: row.selection || null,
		}));
}

export function setAccountAlias(
	db: HostDb,
	agent: ManagedAgent,
	selection: string | null,
	label: string | null,
) {
	if (selection !== null && (!selection || selection.length > 4096))
		throw new Error("account_alias_invalid");
	const name = label?.trim() || null;
	if (name && (name.length > 64 || /[\p{Cc}\p{Cf}]/u.test(name)))
		throw new Error("account_alias_invalid");
	const key = selection ?? "";
	const where = and(
		eq(agentAccountAliases.agent, agent),
		eq(agentAccountAliases.selection, key),
	);
	if (!name) {
		db.delete(agentAccountAliases).where(where).run();
		return;
	}
	db.transaction((tx) => {
		const existing = tx.select().from(agentAccountAliases).where(where).get();
		if (
			!existing &&
			(tx.select({ total: count() }).from(agentAccountAliases).get()?.total ??
				0) >= MAX_ALIASES
		)
			throw new Error("account_alias_limit");
		tx.insert(agentAccountAliases)
			.values({ agent, selection: key, label: name })
			.onConflictDoUpdate({
				target: [agentAccountAliases.agent, agentAccountAliases.selection],
				set: { label: name },
			})
			.run();
	});
}
