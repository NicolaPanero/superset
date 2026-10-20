import { expect, test } from "bun:test";
import type { HarnessMcpServer } from "../types";
import { acpMcpServers } from "./forkMcpServers";

const servers: HarnessMcpServer[] = [
	{
		transport: "http",
		name: "remote",
		url: "https://mcp.example.com/",
		headers: { Authorization: "Bearer token" },
	},
	{
		transport: "sse",
		name: "events",
		url: "https://sse.example.com/",
		headers: {},
	},
	{
		transport: "stdio",
		name: "local",
		command: "npx",
		args: ["-y", "server"],
		env: { API_KEY: "secret" },
	},
];

test("sends remote servers only over transports the agent advertises", () => {
	expect(acpMcpServers(servers, {}).map((server) => server.name)).toEqual([
		"local",
	]);
	expect(
		acpMcpServers(servers, { mcpCapabilities: { http: true } }).map(
			(server) => server.name,
		),
	).toEqual(["remote", "local"]);
});

test("converts header and env maps to the ACP name/value pairs", () => {
	expect(
		acpMcpServers(servers, { mcpCapabilities: { http: true, sse: true } }),
	).toEqual([
		{
			type: "http",
			name: "remote",
			url: "https://mcp.example.com/",
			headers: [{ name: "Authorization", value: "Bearer token" }],
		},
		{
			type: "sse",
			name: "events",
			url: "https://sse.example.com/",
			headers: [],
		},
		{
			name: "local",
			command: "npx",
			args: ["-y", "server"],
			env: [{ name: "API_KEY", value: "secret" }],
		},
	]);
	expect(acpMcpServers(undefined, {})).toEqual([]);
});
