import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { VerifiedNativeAgent } from "../session-transfer/registry";
import { projects, workspaces } from "./schema.ts";

export const forkJiraAutomations = sqliteTable("fork_jira_automations", {
	id: text().primaryKey(),
	scope: text().notNull(),
	connectionId: text("connection_id").notNull(),
	projectId: text("project_id")
		.notNull()
		.references(() => projects.id, { onDelete: "cascade" }),
	name: text().notNull(),
	jql: text().notNull(),
	agent: text().notNull(),
	prompt: text().notNull(),
	enabled: integer({ mode: "boolean" }).notNull().default(false),
	initialized: integer({ mode: "boolean" }).notNull().default(false),
	checkedAt: integer("checked_at"),
	error: text(),
});

export const forkJiraAutomationLaunches = sqliteTable(
	"fork_jira_automation_launches",
	{
		ruleId: text("rule_id")
			.primaryKey()
			.references(() => forkJiraAutomations.id, { onDelete: "cascade" }),
		surface: text().notNull().$type<"terminal" | "chat">(),
		model: text(),
		accountSelection: text("account_selection"),
	},
);

export const forkJiraAutomationRuns = sqliteTable(
	"fork_jira_automation_runs",
	{
		ruleId: text("rule_id")
			.notNull()
			.references(() => forkJiraAutomations.id, { onDelete: "cascade" }),
		taskId: text("task_id").notNull(),
		taskKey: text("task_key").notNull(),
		workspaceId: text("workspace_id"),
		error: text(),
		createdAt: integer("created_at").notNull(),
	},
	(table) => [primaryKey({ columns: [table.ruleId, table.taskId] })],
);

export const forkJiraStatusMappings = sqliteTable(
	"fork_jira_status_mappings",
	{
		scope: text().notNull(),
		connectionId: text("connection_id").notNull(),
		projectKey: text("project_key").notNull(),
		progressStatusId: text("progress_status_id"),
		reviewStatusId: text("review_status_id"),
	},
	(table) => [
		primaryKey({
			columns: [table.scope, table.connectionId, table.projectKey],
		}),
	],
);

export const forkJiraWorklogOps = sqliteTable("fork_jira_worklog_ops", {
	id: text().primaryKey(),
	scope: text().notNull(),
	connectionId: text("connection_id").notNull(),
	issueKey: text("issue_key").notNull(),
	started: text().notNull(),
	seconds: integer().notNull(),
	comment: text(),
	state: text().notNull().$type<"pending" | "done" | "unknown">(),
	worklogId: text("worklog_id"),
	createdAt: integer("created_at").notNull(),
});

export type ForkAutomationSourceKind =
	| "jira"
	| "pr_comments"
	| "ci_failure"
	| "schedule";
export type ForkAutomationAttemptState =
	| "queued"
	| "launching"
	| "running"
	| "waiting_input"
	| "agent_done"
	| "verifying"
	| "verified"
	| "failed"
	| "cancelled"
	| "skipped"
	| "retried"
	| "unknown";
export const forkAutomationRuleOptions = sqliteTable(
	"fork_automation_rule_options",
	{
		ruleId: text("rule_id")
			.primaryKey()
			.references(() => forkJiraAutomations.id, { onDelete: "cascade" }),
		sourceKind: text("source_kind")
			.notNull()
			.default("jira")
			.$type<ForkAutomationSourceKind>(),
		sourceConfig: text("source_config", { mode: "json" })
			.notNull()
			.default({})
			.$type<Record<string, unknown>>(),
		refire: text()
			.notNull()
			.default("never")
			.$type<"never" | "status_change">(),
		catchupMinutes: integer("catchup_minutes").notNull().default(120),
		verifyCommand: text("verify_command"),
		retryLimit: integer("retry_limit").notNull().default(3),
		targetLimit: integer("target_limit"),
		pausedReason: text("paused_reason"),
		failures: integer().notNull().default(0),
	},
);
export const forkAutomationSettings = sqliteTable("fork_automation_settings", {
	scope: text().primaryKey(),
	maxRunning: integer("max_running").notNull().default(2),
	maxPerProject: integer("max_per_project").notNull().default(1),
});
export const forkAgentCliUpdates = sqliteTable("fork_agent_cli_updates", {
	agent: text().primaryKey(),
	checkedAt: integer("checked_at").notNull(),
	latest: text(),
	snoozedUntil: integer("snoozed_until"),
});
export const forkAgentCliSettings = sqliteTable("fork_agent_cli_settings", {
	scope: text().primaryKey(),
	enabled: integer({ mode: "boolean" }).notNull().default(true),
});
export const forkAutomationSeen = sqliteTable(
	"fork_automation_seen",
	{
		ruleId: text("rule_id")
			.notNull()
			.references(() => forkJiraAutomations.id, { onDelete: "cascade" }),
		itemKey: text("item_key").notNull(),
		createdAt: integer("created_at").notNull(),
	},
	(table) => [primaryKey({ columns: [table.ruleId, table.itemKey] })],
);
export const forkAutomationAttempts = sqliteTable("fork_automation_attempts", {
	id: text().primaryKey(),
	ruleId: text("rule_id")
		.notNull()
		.references(() => forkJiraAutomations.id, { onDelete: "cascade" }),
	eventKey: text("event_key").notNull(),
	target: text(),
	title: text().notNull(),
	url: text(),
	prompt: text().notNull(),
	workspaceId: text("workspace_id"),
	terminalId: text("terminal_id"),
	state: text().notNull().$type<ForkAutomationAttemptState>(),
	previousAttemptId: text("previous_attempt_id"),
	retryCount: integer("retry_count").notNull().default(0),
	nextAttemptAt: integer("next_attempt_at"),
	manual: integer({ mode: "boolean" }).notNull().default(false),
	error: text(),
	verifyOutput: text("verify_output"),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
});

export const forkTimesheetSettings = sqliteTable(
	"fork_timesheet_settings",
	{
		scope: text().notNull(),
		connectionId: text("connection_id").notNull(),
		settings: text({ mode: "json" })
			.notNull()
			.$type<
				import("../fork-integrations/fork-timesheet").ForkTimesheetSettings
			>(),
	},
	(table) => [primaryKey({ columns: [table.scope, table.connectionId] })],
);
export const forkTimesheetProposals = sqliteTable("fork_timesheet_proposals", {
	id: text().primaryKey(),
	scope: text().notNull(),
	connectionId: text("connection_id").notNull(),
	data: text({ mode: "json" })
		.notNull()
		.$type<
			import("../fork-integrations/fork-timesheet").ForkTimesheetProposal
		>(),
	createdAt: integer("created_at").notNull(),
});

export const forkIntegrationSettings = sqliteTable(
	"fork_integration_settings",
	{
		scope: text().primaryKey(),
		brokerUrl: text("broker_url").notNull(),
	},
);
export const forkIntegrationConnections = sqliteTable(
	"fork_integration_connections",
	{
		id: text().notNull(),
		scope: text().notNull(),
		provider: text().notNull(),
		metadata: text({ mode: "json" })
			.notNull()
			.$type<import("@superset/shared/fork-integrations").ForkConnection>(),
		secret: text(),
	},
	(table) => [primaryKey({ columns: [table.scope, table.id] })],
);
export const forkIntegrationBindings = sqliteTable(
	"fork_integration_bindings",
	{
		scope: text().notNull(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		repository: text({ mode: "json" })
			.notNull()
			.$type<import("@superset/shared/fork-integrations").ForkRepositoryRef>(),
		connectionId: text("connection_id").notNull(),
		remote: text().notNull(),
	},
	(table) => [primaryKey({ columns: [table.scope, table.projectId] })],
);
export const forkExternalTaskLinks = sqliteTable(
	"fork_external_task_links",
	{
		scope: text().notNull(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		taskKey: text("task_key").notNull(),
		task: text({ mode: "json" })
			.notNull()
			.$type<import("@superset/shared/fork-integrations").ForkTaskLink>(),
	},
	(table) => [
		primaryKey({ columns: [table.scope, table.workspaceId, table.taskKey] }),
	],
);
export const forkWorkspacePullRequests = sqliteTable(
	"fork_workspace_pull_requests",
	{
		scope: text().notNull(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		pullRequest: text("pull_request", { mode: "json" })
			.notNull()
			.$type<import("@superset/shared/fork-integrations").ForkPullRequest>(),
	},
	(table) => [primaryKey({ columns: [table.scope, table.workspaceId] })],
);

/**
 * Tables owned by the fork. They stay out of schema.ts and the drizzle
 * journal so upstream migrations never collide with them; ensureForkTables
 * creates them.
 */

/** Local profile display names; credentials remain in the native CLI stores. */
export const chatQuotaRecovery = sqliteTable(
	"chat_quota_recovery",
	{
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		terminalId: text("terminal_id").notNull(),
		switchAccounts: integer("switch_accounts", { mode: "boolean" }).notNull(),
		resumeAtReset: integer("resume_at_reset", { mode: "boolean" }).notNull(),
		hasSelection: integer("has_selection", { mode: "boolean" }).notNull(),
		nativeSessionId: text("native_session_id"),
		accountSelection: text("account_selection"),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [primaryKey({ columns: [table.workspaceId, table.terminalId] })],
);

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

/**
 * Extra folders attached to a project next to its primary `repoPath`. A
 * folder is a plain absolute path: it may or may not be a git repository and
 * is shared by every workspace of the project.
 */
export const projectFolders = sqliteTable(
	"project_folders",
	{
		id: text().primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		path: text().notNull(),
		position: integer().notNull().default(0),
		// A git folder gets its own worktree, on the workspace's branch, in
		// every worktree workspace. Off shares the folder itself.
		isolateInWorktrees: integer("isolate_in_worktrees", { mode: "boolean" })
			.notNull()
			.default(true),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("project_folders_project_id_idx").on(table.projectId),
		uniqueIndex("project_folders_project_path_unique").on(
			table.projectId,
			table.path,
		),
	],
);

/** The worktree a workspace holds for one of its project's extra git folders. */
export const workspaceFolderWorktrees = sqliteTable(
	"workspace_folder_worktrees",
	{
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		folderId: text("folder_id")
			.notNull()
			.references(() => projectFolders.id, { onDelete: "cascade" }),
		worktreePath: text("worktree_path").notNull(),
		branch: text().notNull(),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [primaryKey({ columns: [table.workspaceId, table.folderId] })],
);
