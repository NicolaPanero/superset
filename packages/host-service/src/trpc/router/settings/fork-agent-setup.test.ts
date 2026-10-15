import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../../db/schema";
import {
	initTerminalBaseEnv,
	resetTerminalBaseEnvForTests,
} from "../../../terminal/env";
import type { HostServiceContext } from "../../../types";
import { agentConfigsRouter } from "./agent-configs";
import { createForkAgentSetupRouter } from "./fork-agent-setup";
import type { SetupProbe } from "./fork-agent-setup-probe";

afterEach(resetTerminalBaseEnvForTests);

async function fixture(presetId = "grok") {
	initTerminalBaseEnv({ PATH: "/fake", HOME: "/fake" });
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, {
		migrationsFolder: resolve(import.meta.dir, "../../../../drizzle"),
	});
	const ctx = { db, isAuthenticated: true } as unknown as HostServiceContext;
	const agents = agentConfigsRouter.createCaller(ctx);
	const grok = (await agents.list()).find((row) => row.presetId === presetId);
	if (!grok) throw new Error("missing fixture");
	let duringProbe = () => {};
	const probe: SetupProbe = {
		command: `/fake/${presetId}`,
		version: "1.0.50",
		chat: true,
		auth: "login",
		model: null,
		modelOverrides: false,
	};
	const router = createForkAgentSetupRouter(async () => {
		duringProbe();
		return probe;
	});
	return {
		sqlite,
		db,
		agents,
		config: grok,
		probe,
		caller: router.createCaller(ctx),
		changeDuringProbe: (action: () => void) => {
			duringProbe = action;
		},
		router,
		ctx,
	};
}
test("recommended setup preserves identity, ordering, other env and does not enable auto approval", async () => {
	const f = await fixture();
	try {
		await f.agents.update({
			id: f.config.id,
			patch: { label: "My Grok", env: { TEST_SETTING: "kept" } },
		});
		const before = await f.caller.inspect({ configId: f.config.id });
		expect(
			await f.caller.configure({
				configId: f.config.id,
				expectedCommand: before.command as string,
				expectedRevision: before.revision,
			}),
		).toEqual({ success: true });
		const result = (await f.agents.list()).find(
			(row) => row.id === f.config.id,
		);
		expect(result?.label).toBe("My Grok");
		expect(result?.order).toBe(f.config.order);
		expect(result?.env).toEqual({ TEST_SETTING: "kept" });
		expect(result?.args).toEqual([]);
	} finally {
		f.sqlite.close();
	}
});
test("API setup requires explicit key and leaves unrelated credentials unchanged", async () => {
	const f = await fixture();
	try {
		const before = await f.caller.inspect({ configId: f.config.id });
		const result = await f.caller.configure({
			configId: f.config.id,
			expectedCommand: before.command as string,
			expectedRevision: before.revision,
			api: { key: "secret-fixture", model: "grok-4.7" },
		});
		expect(JSON.stringify(result)).not.toContain("secret-fixture");
		const config = (await f.agents.list()).find(
			(row) => row.id === f.config.id,
		);
		expect(config?.args).toEqual(["--model", "grok-4.7"]);
		expect(config?.env.GROK_MODELS_BASE_URL).toBe("https://api.x.ai/v1");
		expect(config?.env.XAI_API_KEY).toBe("secret-fixture");
	} finally {
		f.sqlite.close();
	}
});
test("native model credentials and binary changes prevent ambiguous API setup", async () => {
	const f = await fixture();
	try {
		const before = await f.caller.inspect({ configId: f.config.id });
		const input = {
			configId: f.config.id,
			expectedCommand: before.command as string,
			expectedRevision: before.revision,
			api: { key: "key", model: "grok-4.7" },
		};
		f.probe.modelOverrides = true;
		await expect(f.caller.configure(input)).rejects.toThrow(
			"agent_setup_model_credentials",
		);
		f.probe.modelOverrides = false;
		f.probe.command = "/different/grok";
		await expect(f.caller.configure(input)).rejects.toThrow(
			"agent_setup_changed",
		);
		expect(
			(await f.agents.list()).find((row) => row.id === f.config.id)?.command,
		).toBe(f.config.command);
	} finally {
		f.sqlite.close();
	}
});
test("an edit during probing cannot be overwritten by a stale apply", async () => {
	const f = await fixture();
	try {
		const before = await f.caller.inspect({ configId: f.config.id });
		f.changeDuringProbe(() => {
			f.db
				.update(schema.hostAgentConfigs)
				.set({ command: "/my/custom/grok" })
				.where(eq(schema.hostAgentConfigs.id, f.config.id))
				.run();
		});
		await expect(
			f.caller.configure({
				configId: f.config.id,
				expectedCommand: before.command as string,
				expectedRevision: before.revision,
			}),
		).rejects.toThrow("agent_setup_changed");
		expect(
			(await f.agents.list()).find((row) => row.id === f.config.id)?.command,
		).toBe("/my/custom/grok");
	} finally {
		f.sqlite.close();
	}
});
test("setup rejects preset aliases, unsupported providers and unauthenticated callers", async () => {
	const f = await fixture();
	try {
		await expect(f.caller.inspect({ configId: "grok" })).rejects.toThrow(
			"agent_setup_unavailable",
		);
		const claude = (await f.agents.list()).find(
			(row) => row.presetId === "claude",
		);
		await expect(
			f.caller.inspect({ configId: claude?.id ?? "missing" }),
		).rejects.toThrow("agent_setup_unavailable");
		const unauth = f.router.createCaller({ ...f.ctx, isAuthenticated: false });
		await expect(unauth.inspect({ configId: f.config.id })).rejects.toThrow();
	} finally {
		f.sqlite.close();
	}
});

test("Cursor API setup stores only its key and preserves other environment settings", async () => {
	const f = await fixture("cursor-agent");
	try {
		await f.agents.update({
			id: f.config.id,
			patch: { env: { SETTING: "kept" }, args: ["--model", "custom-model"] },
		});
		const before = await f.caller.inspect({ configId: f.config.id });
		const result = await f.caller.configure({
			configId: f.config.id,
			expectedCommand: before.command as string,
			expectedRevision: before.revision,
			cursorApiKey: "cursor-secret-fixture",
		});
		expect(JSON.stringify(result)).not.toContain("cursor-secret-fixture");
		const config = (await f.agents.list()).find(
			(row) => row.id === f.config.id,
		);
		expect(config?.env).toEqual({
			SETTING: "kept",
			CURSOR_API_KEY: "cursor-secret-fixture",
		});
		expect(config?.args).toEqual(["--model", "custom-model"]);
	} finally {
		f.sqlite.close();
	}
});
test("a Cursor key cannot be written into a Grok configuration", async () => {
	const f = await fixture();
	try {
		const before = await f.caller.inspect({ configId: f.config.id });
		await expect(
			f.caller.configure({
				configId: f.config.id,
				expectedCommand: before.command as string,
				expectedRevision: before.revision,
				cursorApiKey: "fixture",
			}),
		).rejects.toThrow("agent_setup_unavailable");
		expect(
			(await f.agents.list()).find((row) => row.id === f.config.id)?.env
				.CURSOR_API_KEY,
		).toBeUndefined();
	} finally {
		f.sqlite.close();
	}
});
