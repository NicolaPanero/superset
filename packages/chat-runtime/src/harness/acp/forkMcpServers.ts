import type { HarnessMcpServer } from "../types";

type AcpPair = { name: string; value: string };

export type AcpMcpServer =
	| {
			name: string;
			command: string;
			args: string[];
			env: AcpPair[];
	  }
	| {
			type: "http" | "sse";
			name: string;
			url: string;
			headers: AcpPair[];
	  };

function pairs(values: Record<string, string>): AcpPair[] {
	return Object.entries(values).map(([name, value]) => ({ name, value }));
}

/**
 * Wire shape for session/new, session/load and session/fork. Stdio is part of
 * the base protocol; HTTP and SSE go out only when the agent advertises them,
 * because an agent that cannot use a transport rejects the whole session.
 */
export function acpMcpServers(
	servers: HarnessMcpServer[] | undefined,
	agentCapabilities: Record<string, unknown>,
): AcpMcpServer[] {
	const supported = (agentCapabilities.mcpCapabilities ?? {}) as {
		http?: boolean;
		sse?: boolean;
	};
	return (servers ?? []).flatMap((server): AcpMcpServer[] => {
		if (server.transport === "stdio")
			return [
				{
					name: server.name,
					command: server.command,
					args: server.args,
					env: pairs(server.env),
				},
			];
		if (supported[server.transport] !== true) return [];
		return [
			{
				type: server.transport,
				name: server.name,
				url: server.url,
				headers: pairs(server.headers),
			},
		];
	});
}
