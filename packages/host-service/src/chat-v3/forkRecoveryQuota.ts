import { probeAccount } from "../trpc/router/usage/fork-account-probe";
import { isolatedAccountQuota } from "../trpc/router/usage/fork-isolated-accounts";
import { getQuota } from "../trpc/router/usage/fork-quota-cache";
import {
	type SessionAccount,
	validateSessionAccount,
} from "../trpc/router/usage/session-account/session-account";

const dependencies = {
	read: async () => isolatedAccountQuota(await getQuota(true)),
	probe: probeAccount,
	validate: validateSessionAccount,
};

export async function forkRecoveryQuota(
	agent: "claude" | "codex",
	account: SessionAccount | undefined,
	deps = dependencies,
) {
	const rows = await deps.read();
	if (
		!account ||
		account.agent !== agent ||
		account.credentialKind !== "subscription"
	)
		return rows;
	const own = rows.find(
		(row) =>
			row.agent === agent &&
			row.selection === account.selection &&
			row.credentialKind === "subscription",
	);
	if (
		!own ||
		(own.status !== "token_stale" && own.status !== "token_expired") ||
		!(await deps.validate(account))
	)
		return rows;
	const checked = await deps.probe(agent, account.selection).catch(() => null);
	if (checked?.status !== "checked" || !(await deps.validate(account)))
		return rows;
	return deps.read();
}
