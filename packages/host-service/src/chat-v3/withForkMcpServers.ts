import type { HarnessFactory } from "@superset/chat-runtime";
import {
	harnessMcpServers,
	readForkMcpServers,
} from "../fork-mcp/fork-mcp-servers";

/** Hands every new or reopened session the Fork Settings MCP servers. */
export function withForkMcpServers(factory: HarnessFactory): HarnessFactory {
	return (options) => {
		const adapter = factory(options);
		return new Proxy(adapter, {
			get(target, property) {
				if (property === "start") {
					return (startOptions: Parameters<typeof target.start>[0]) => {
						const mcpServers = harnessMcpServers(readForkMcpServers());
						return target.start(
							mcpServers.length > 0
								? { ...startOptions, mcpServers }
								: startOptions,
						);
					};
				}
				const value = Reflect.get(target, property, target);
				return typeof value === "function" ? value.bind(target) : value;
			},
		});
	};
}
