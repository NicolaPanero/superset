import { useHostUsageQuota } from "renderer/hooks/host-service/useHostUsageQuota";
import { useForkCliOptions } from "renderer/stores/fork-cli-options";
import { pickCatalogAccount } from "./pickCatalogAccount";

/**
 * The login that reads another agent's model list. The default login is
 * often the one that needs reconnecting, and a probe on it only times out.
 */
export function useForkCatalogAccount(
	hostUrl: string | null,
	provider: string | null,
	enabled: boolean,
) {
	const showCliOptions = useForkCliOptions();
	const managed = provider === "claude" || provider === "codex";
	const watching = enabled && managed && !!hostUrl;
	const quota = useHostUsageQuota(watching ? hostUrl : null);
	if (!watching || quota.isError)
		return { selection: undefined, ready: true, blocked: false };
	if (!quota.data)
		return { selection: undefined, ready: false, blocked: false };
	const selection = pickCatalogAccount(quota.data, provider);
	if (selection !== null) return { selection, ready: true, blocked: false };
	return { selection: undefined, ready: true, blocked: !showCliOptions };
}
