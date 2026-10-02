import {
	mcpHeadersHelperCommand,
	readInstalledPluginSources,
	type SyncManagedMcpServersOptions,
	syncManagedMcpServers,
} from "@superset/agent-setup";
import { desiredPluginMcpServers } from "@superset/shared/plugins";

/**
 * Converges this machine's agent MCP configs on the installed set, reaping what
 * is no longer wanted. Offline by construction: an entry is one per plugin and
 * names no account, so nothing here needs the account list.
 */
export function syncPluginMcpServers(
	options: SyncManagedMcpServersOptions = {},
): {
	servers: number;
	error: string | null;
} {
	const desired = desiredPluginMcpServers(readInstalledPluginSources() ?? [], {
		headersHelper: mcpHeadersHelperCommand(),
	});
	try {
		syncManagedMcpServers(desired, options);
	} catch (error) {
		// A config linked into a read-only store (Nix home-manager and friends)
		// fails here by design. The skills are already materialized and the plugin
		// is installed, so this is reported, not thrown.
		return {
			servers: 0,
			error: error instanceof Error ? error.message : String(error),
		};
	}
	return { servers: Object.keys(desired).length, error: null };
}
