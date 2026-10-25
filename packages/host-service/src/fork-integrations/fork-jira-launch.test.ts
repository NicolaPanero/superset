import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import type { HostServiceContext } from "../types";
import { launchForkJiraAgent } from "./fork-jira-launch";

function fixture(supported: boolean) {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: resolve(import.meta.dir, "../../drizzle") });
	db.insert(schema.hostAgentConfigs)
		.values({
			id: "agent-config",
			presetId: "claude",
			label: "Claude",
			command: "claude",
			argsJson: "[]",
			promptTransport: "argv",
			promptArgsJson: "[]",
			envJson: "{}",
			displayOrder: 0,
		})
		.run();
	db.insert(schema.workspaces)
		.values({
			id: "workspace",
			branch: "main",
			name: "Fixture",
			worktreePath: "/workspace/path",
		})
		.run();
	const sessions: unknown[] = [];
	const prompts: unknown[] = [];
	const ctx = {
		db: db as unknown as HostDb,
		runtime: {
			chat: () => ({
				live: { supports: () => supported, get: () => undefined },
				commands: {
					createSession: (input: unknown) => {
						sessions.push(input);
						return { sessionId: "chat-session" };
					},
					prompt: (input: unknown) => prompts.push(input),
				},
			}),
		},
	} as unknown as HostServiceContext;
	return { sqlite, ctx, sessions, prompts };
}

test("Jira ACP launches pass the pinned account, model and issue prompt to the chat runtime", async () => {
	const { sqlite, ctx, sessions, prompts } = fixture(true);
	try {
		const result = await launchForkJiraAgent(ctx, {
			workspaceId: "workspace",
			agent: "agent-config",
			surface: "chat",
			model: "sonnet",
			accountSelection: "/isolated/work",
			prompt: "Fix APP-123",
		});
		expect(result.chatSessionId).toBe("chat-session");
		expect(sessions).toEqual([
			expect.objectContaining({
				scopeId: "workspace",
				harness: "claude-acp",
				agentConfigId: "agent-config",
				modelId: "sonnet",
				accountSelection: "/isolated/work",
				cwd: "/workspace/path",
			}),
		]);
		expect(prompts).toEqual([
			expect.objectContaining({
				sessionId: "chat-session",
				content: [{ type: "text", text: "Fix APP-123" }],
			}),
		]);
	} finally {
		sqlite.close();
	}
});

test("an unavailable Jira ACP runtime fails without falling back to a terminal", async () => {
	const { sqlite, ctx, sessions } = fixture(false);
	try {
		await expect(
			launchForkJiraAgent(ctx, {
				workspaceId: "workspace",
				agent: "agent-config",
				surface: "chat",
				prompt: "Fix APP-123",
			}),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
		expect(sessions).toEqual([]);
	} finally {
		sqlite.close();
	}
});
