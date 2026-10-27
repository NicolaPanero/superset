import { expect, test } from "bun:test";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import { pickCatalogAccount } from "./pickCatalogAccount";

function row(
	selection: string | null,
	status: UsageAccount["status"],
	isDefault = false,
	agent: UsageAccount["agent"] = "claude",
): UsageAccount {
	return {
		agent,
		selection,
		credentialKind: "subscription",
		accountKey: String(selection),
		sourceLabel: String(selection),
		email: null,
		plan: null,
		status,
		statusDetail: null,
		windows: [],
		creditsBalance: null,
		extraUsage: null,
		isDefault,
		fetchedAt: new Date(),
	};
}

test("a default login that needs reconnecting is skipped for the next usable login", () => {
	const rows = [
		row("/first", "signed_out", true),
		row("/second", "ok"),
		row("/third", "token_expired"),
	];
	expect(pickCatalogAccount(rows, "claude")).toBe("/second");
});

test("a usable default login stays the first choice", () => {
	const rows = [row("/first", "ok"), row("/second", "ok", true)];
	expect(pickCatalogAccount(rows, "claude")).toBe("/second");
});

test("other agents, the CLI login and a stale token do not block the pick", () => {
	const rows = [
		row("/codex", "ok", true, "codex"),
		row(null, "ok"),
		row("/stale", "token_stale"),
	];
	expect(pickCatalogAccount(rows, "claude")).toBe("/stale");
});

test("no usable login gives no account to probe", () => {
	const rows = [row("/a", "signed_out"), row("/b", "token_expired")];
	expect(pickCatalogAccount(rows, "claude")).toBeNull();
	expect(pickCatalogAccount([], "claude")).toBeNull();
});
