import { describe, expect, test } from "bun:test";
import { desiredPluginMcpServers, pluginProxyMcpServers } from "./index";

const WORK = {
	connector: "linear",
	connectionId: "conn-work",
	externalUserId: "lu-1",
};
const SIDE = {
	connector: "linear",
	connectionId: "conn-side",
	externalUserId: "lu-2",
};

/**
 * An unpinned entry 409s on every request once a connector holds two accounts,
 * tool list included — so the agent sees the plugin with no tools at all. The
 * entry names are how an agent expresses which account it means.
 */
describe("pluginProxyMcpServers", () => {
	test("one account keeps the plain name and an unpinned url", () => {
		const servers = pluginProxyMcpServers("linear", "superset", {
			connections: [WORK],
		});
		expect(Object.keys(servers ?? {})).toEqual(["linear"]);
		expect((servers?.linear as { url: string }).url).not.toContain(
			"connection=",
		);
	});

	// Renaming the single entry the moment a second arrives would orphan the
	// token the agent stored against the old name.
	test("no connections also keeps the plain name", () => {
		const servers = pluginProxyMcpServers("linear", "superset", {});
		expect(Object.keys(servers ?? {})).toEqual(["linear"]);
	});

	test("two accounts split into one pinned entry each, named by external user id", () => {
		const servers = pluginProxyMcpServers("linear", "superset", {
			connections: [WORK, SIDE],
		});
		expect(Object.keys(servers ?? {}).sort()).toEqual([
			"linear-lu-1",
			"linear-lu-2",
		]);
		expect((servers?.["linear-lu-1"] as { url: string }).url).toContain(
			"connection=conn-work",
		);
		expect((servers?.["linear-lu-2"] as { url: string }).url).toContain(
			"connection=conn-side",
		);
	});

	test("ignores connections belonging to another connector", () => {
		const servers = pluginProxyMcpServers("linear", "superset", {
			connections: [WORK, { ...SIDE, connector: "notion" }],
		});
		expect(Object.keys(servers ?? {})).toEqual(["linear"]);
	});

	// Codex table keys and MCP server names are identifiers; an email or a
	// provider id with punctuation would produce a config that does not parse.
	test("sanitizes an identifier that is not identifier-safe", () => {
		const servers = pluginProxyMcpServers("linear", "superset", {
			connections: [
				{ ...WORK, externalUserId: "a.b@c.com" },
				{ ...SIDE, externalUserId: "d/e f" },
			],
		});
		for (const name of Object.keys(servers ?? {})) {
			expect(name).toMatch(/^[A-Za-z0-9_-]+$/);
		}
	});

	test("falls back to the connection id when the provider gave no user id", () => {
		const servers = pluginProxyMcpServers("linear", "superset", {
			connections: [
				{ ...WORK, externalUserId: null },
				{ ...SIDE, externalUserId: null },
			],
		});
		expect(Object.keys(servers ?? {}).sort()).toEqual([
			"linear-conn-side",
			"linear-conn-work",
		]);
	});

	test("carries the headers helper onto every entry", () => {
		const servers = pluginProxyMcpServers("linear", "superset", {
			connections: [WORK, SIDE],
			headersHelper: "/usr/local/bin/superset mcp headers",
		});
		for (const config of Object.values(servers ?? {})) {
			expect((config as { headersHelper?: string }).headersHelper).toBe(
				"/usr/local/bin/superset mcp headers",
			);
		}
	});
});

describe("desiredPluginMcpServers", () => {
	test("splits an installed plugin's entries by account", () => {
		const desired = desiredPluginMcpServers([{ name: "linear" }], {
			connections: [WORK, SIDE],
		});
		expect(Object.keys(desired).sort()).toEqual(["linear-lu-1", "linear-lu-2"]);
	});

	test("a disabled install contributes nothing, which is what reaps it", () => {
		const desired = desiredPluginMcpServers(
			[{ name: "linear", enabled: false }],
			{ connections: [WORK, SIDE] },
		);
		expect(desired).toEqual({});
	});
});
