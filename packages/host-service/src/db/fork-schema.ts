import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { VerifiedNativeAgent } from "../session-transfer/registry";
import { workspaces } from "./schema.ts";

/**
 * Tables owned by the fork. They stay out of schema.ts and the drizzle
 * journal so upstream migrations never collide with them; ensureForkTables
 * creates them.
 */

/** Local profile display names; credentials remain in the native CLI stores. */
export const agentAccountAliases = sqliteTable(
	"agent_account_aliases",
	{
		agent: text().$type<"claude" | "codex">().notNull(),
		// Empty means the system login slot. Concrete profile selections are paths.
		selection: text().notNull(),
		label: text().notNull(),
	},
	(table) => [primaryKey({ columns: [table.agent, table.selection] })],
);

export const sessionLineageNodes = sqliteTable(
	"session_lineage_nodes",
	{
		id: text().primaryKey(),
		organizationId: text("organization_id").notNull(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		agent: text().notNull().$type<VerifiedNativeAgent>(),
		sessionId: text("session_id").notNull(),
		storeRoot: text("store_root").notNull(),
		reference: text().notNull(),
		cwd: text().notNull(),
		configId: text("config_id").notNull(),
		label: text().notNull(),
		profileOverride: text("profile_override"),
		lastTerminalId: text("last_terminal_id"),
		createdAt: integer("created_at").notNull(),
	},
	(table) => [
		uniqueIndex("session_lineage_nodes_native_idx").on(
			table.organizationId,
			table.workspaceId,
			table.agent,
			table.sessionId,
			table.storeRoot,
		),
	],
);

export const sessionLineageEdges = sqliteTable(
	"session_lineage_edges",
	{
		id: text().primaryKey(),
		organizationId: text("organization_id").notNull(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		sourceNodeId: text("source_node_id")
			.notNull()
			.references(() => sessionLineageNodes.id, { onDelete: "cascade" }),
		targetNodeId: text("target_node_id")
			.notNull()
			.references(() => sessionLineageNodes.id, { onDelete: "cascade" }),
		provider: text().notNull().$type<"native">(),
		warnings: text({ mode: "json" }).notNull().$type<string[]>(),
		createdAt: integer("created_at").notNull(),
	},
	(table) => [
		index("session_lineage_edges_workspace_idx").on(
			table.organizationId,
			table.workspaceId,
			table.createdAt,
			table.id,
		),
		index("session_lineage_edges_source_idx").on(table.sourceNodeId),
		index("session_lineage_edges_target_idx").on(table.targetNodeId),
	],
);

/** ACP chats whose pane was closed; they keep running and can be reopened. */
export const backgroundChats = sqliteTable(
	"background_chats",
	{
		terminalId: text("terminal_id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		title: text().notNull(),
		paneData: text("pane_data", { mode: "json" })
			.notNull()
			.$type<Record<string, unknown>>(),
		parkedAt: integer("parked_at").notNull(),
	},
	(table) => [
		index("background_chats_workspace_idx").on(
			table.workspaceId,
			table.parkedAt,
		),
	],
);
