import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { HostDb } from "../db";
import { ensureForkTables } from "../db/fork-tables";
import {
	FORK_AGENT_CLI_DAY_MS,
	type ForkAgentCliDeps,
	forkAgentCliChecksEnabled,
	forkAgentCliIsNewer,
	forkAgentCliStatuses,
	forkSetAgentCliChecks,
	forkSnoozeAgentCliUpdates,
	forkUpdateAgentCli,
} from "./fork-agent-cli-updates";

function fixture(
	options: {
		installed?: Record<string, string>;
		latest?: Record<string, string | null>;
		paths?: Record<string, string>;
		afterUpdate?: Record<string, string>;
	} = {},
) {
	const sqlite = new Database(":memory:");
	sqlite.exec(
		"CREATE TABLE projects (id text PRIMARY KEY); CREATE TABLE workspaces (id text PRIMARY KEY);",
	);
	ensureForkTables(sqlite);
	const installed = { claude: "2.1.4", codex: "0.9.0", ...options.installed };
	const latest: Record<string, string | null> = {
		"@anthropic-ai/claude-code": "2.2.0",
		"@openai/codex": "0.9.0",
		...options.latest,
	};
	const paths: Record<string, string> = {
		claude: "/home/me/.local/bin/claude",
		codex: "/usr/lib/node_modules/@openai/codex/bin/codex",
		...options.paths,
	};
	let time = 1_000_000;
	const calls: string[] = [];
	let registryReads = 0;
	const deps: ForkAgentCliDeps = {
		now: () => time,
		find: (binary) => paths[binary] ?? null,
		run: async (command, args) => {
			calls.push([command, ...args].join(" "));
			const binary = Object.keys(paths).find((name) => paths[name] === command);
			if (args[0] === "--version" && binary)
				return {
					stdout: `${installed[binary as "claude"]} (CLI)\n`,
					stderr: "",
				};
			if (args[0] === "update" && binary && options.afterUpdate)
				installed[binary as "claude"] = options.afterUpdate[binary] ?? "";
			if (command.endsWith("/npm") && options.afterUpdate)
				installed.codex = options.afterUpdate.codex ?? installed.codex;
			return { stdout: "", stderr: "" };
		},
		latest: async (npmPackage) => {
			registryReads++;
			return latest[npmPackage] ?? null;
		},
	};
	const ctx = { db: drizzle(sqlite) as unknown as HostDb };
	return {
		ctx,
		deps,
		sqlite,
		calls,
		registryReads: () => registryReads,
		advance: (ms: number) => {
			time += ms;
		},
	};
}

test("a newer version is reported with the command that would update it", async () => {
	const f = fixture();
	try {
		const [claude, codex] = await forkAgentCliStatuses(f.ctx, f.deps);
		expect(claude).toMatchObject({
			id: "claude",
			installed: "2.1.4",
			latest: "2.2.0",
			newer: true,
			command: "/home/me/.local/bin/claude update",
			snoozed: false,
		});
		expect(codex?.newer).toBe(false);
		expect(codex?.command).toContain("npm install -g @openai/codex@latest");
	} finally {
		f.sqlite.close();
	}
});

test("the registry is read once a day, and again after a failed read within the hour", async () => {
	const f = fixture();
	try {
		await forkAgentCliStatuses(f.ctx, f.deps);
		expect(f.registryReads()).toBe(2);
		f.advance(FORK_AGENT_CLI_DAY_MS - 1000);
		await forkAgentCliStatuses(f.ctx, f.deps);
		expect(f.registryReads()).toBe(2);
		f.advance(2000);
		await forkAgentCliStatuses(f.ctx, f.deps);
		expect(f.registryReads()).toBe(4);
		await forkAgentCliStatuses(f.ctx, f.deps, { force: true });
		expect(f.registryReads()).toBe(6);
	} finally {
		f.sqlite.close();
	}
	const offline = fixture({
		latest: { "@anthropic-ai/claude-code": null, "@openai/codex": null },
	});
	try {
		const [claude] = await forkAgentCliStatuses(offline.ctx, offline.deps);
		expect(claude?.latest).toBeNull();
		expect(claude?.newer).toBe(false);
		offline.advance(30 * 60 * 1000);
		await forkAgentCliStatuses(offline.ctx, offline.deps);
		expect(offline.registryReads()).toBe(2);
		offline.advance(31 * 60 * 1000);
		await forkAgentCliStatuses(offline.ctx, offline.deps);
		expect(offline.registryReads()).toBe(4);
	} finally {
		offline.sqlite.close();
	}
});

test("Later hides the notice until the next day and keeps the version in the list", async () => {
	const f = fixture();
	try {
		await forkAgentCliStatuses(f.ctx, f.deps);
		forkSnoozeAgentCliUpdates(f.ctx, f.deps.now());
		const [snoozed] = await forkAgentCliStatuses(f.ctx, f.deps);
		expect(snoozed).toMatchObject({ newer: true, snoozed: true });
		f.advance(FORK_AGENT_CLI_DAY_MS + 1);
		const [after] = await forkAgentCliStatuses(f.ctx, f.deps);
		expect(after?.snoozed).toBe(false);
	} finally {
		f.sqlite.close();
	}
});

test("an agent that is not installed is listed without a version or command", async () => {
	const f = fixture({ paths: { claude: "" } });
	f.deps.find = (binary) => (binary === "codex" ? "/bin/codex" : null);
	try {
		const [claude] = await forkAgentCliStatuses(f.ctx, f.deps);
		expect(claude).toMatchObject({
			installed: null,
			newer: false,
			command: null,
		});
		await expect(forkUpdateAgentCli(f.ctx, f.deps, "claude")).rejects.toThrow(
			"not installed",
		);
	} finally {
		f.sqlite.close();
	}
});

test("an update runs the fixed command, reads the version again and checks it changed", async () => {
	const f = fixture({ afterUpdate: { claude: "2.2.0" } });
	try {
		const after = await forkUpdateAgentCli(f.ctx, f.deps, "claude");
		expect(f.calls).toContain("/home/me/.local/bin/claude update");
		expect(after).toMatchObject({ installed: "2.2.0", newer: false });
	} finally {
		f.sqlite.close();
	}
	const stuck = fixture({ afterUpdate: { claude: "2.1.4" } });
	try {
		await expect(
			forkUpdateAgentCli(stuck.ctx, stuck.deps, "claude"),
		).rejects.toThrow("still 2.1.4");
	} finally {
		stuck.sqlite.close();
	}
});

test("an install the app cannot identify is never updated by guessing", async () => {
	const f = fixture({
		installed: { codex: "0.8.0" },
		paths: { codex: "/opt/homebrew/Cellar/codex/0.8.0/bin/codex" },
	});
	try {
		const [, codex] = await forkAgentCliStatuses(f.ctx, f.deps);
		expect(codex?.command).toBeNull();
		await expect(forkUpdateAgentCli(f.ctx, f.deps, "codex")).rejects.toThrow(
			"cannot tell how",
		);
		expect(f.calls.some((call) => call.includes("install"))).toBe(false);
	} finally {
		f.sqlite.close();
	}
});

test("the daily check can be turned off and is on by default", () => {
	const f = fixture();
	try {
		expect(forkAgentCliChecksEnabled(f.ctx)).toBe(true);
		forkSetAgentCliChecks(f.ctx, false);
		expect(forkAgentCliChecksEnabled(f.ctx)).toBe(false);
		forkSetAgentCliChecks(f.ctx, true);
		expect(forkAgentCliChecksEnabled(f.ctx)).toBe(true);
	} finally {
		f.sqlite.close();
	}
});

test("versions compare as versions, not as text", () => {
	expect(forkAgentCliIsNewer("2.9.0", "2.10.0")).toBe(true);
	expect(forkAgentCliIsNewer("2.10.0", "2.9.0")).toBe(false);
	expect(forkAgentCliIsNewer("2.2.0", "2.2.0")).toBe(false);
	expect(forkAgentCliIsNewer(null, "2.2.0")).toBe(false);
	expect(forkAgentCliIsNewer("2.1.0", null)).toBe(false);
});
