import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import type { useForkCreationAccount } from "../../../../useForkCreationAccount";

type ReconnectTarget = NonNullable<
	ReturnType<typeof useForkCreationAccount>["reconnect"]
>;

export function needsReconnect(usage: UsageAccount | undefined) {
	return usage?.status === "signed_out" || usage?.status === "token_expired";
}

export function forkReconnectTarget(
	provider: string | null,
	option: { selection: string | null; alias?: string | null; label: string },
	usage: UsageAccount | undefined,
): ReconnectTarget | null {
	if (provider !== "claude" && provider !== "codex") return null;
	return {
		agent: provider,
		credentialKind:
			usage?.credentialKind === "api_key" ? "api_key" : "subscription",
		selection: option.selection,
		label: option.alias ?? usage?.email ?? option.label,
	};
}
