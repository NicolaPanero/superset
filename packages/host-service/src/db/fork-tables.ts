const FORK_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS project_folders (
 id text PRIMARY KEY NOT NULL,
 project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 path text NOT NULL, position integer DEFAULT 0 NOT NULL,
 isolate_in_worktrees integer DEFAULT true NOT NULL, created_at integer NOT NULL
);
CREATE INDEX IF NOT EXISTS project_folders_project_id_idx ON project_folders (project_id);
CREATE UNIQUE INDEX IF NOT EXISTS project_folders_project_path_unique ON project_folders (project_id, path);
CREATE TABLE IF NOT EXISTS workspace_folder_worktrees (
 workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 folder_id text NOT NULL REFERENCES project_folders(id) ON DELETE CASCADE,
 worktree_path text NOT NULL, branch text NOT NULL, created_at integer NOT NULL,
 PRIMARY KEY(workspace_id, folder_id)
);
CREATE TABLE IF NOT EXISTS fork_jira_automations (
 id text PRIMARY KEY NOT NULL, scope text NOT NULL, connection_id text NOT NULL,
 project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 name text NOT NULL, jql text NOT NULL, agent text NOT NULL, prompt text NOT NULL,
 enabled integer NOT NULL DEFAULT 0, initialized integer NOT NULL DEFAULT 0,
 checked_at integer, error text
);
CREATE TABLE IF NOT EXISTS fork_jira_automation_launches (
 rule_id text PRIMARY KEY NOT NULL REFERENCES fork_jira_automations(id) ON DELETE CASCADE,
 surface text NOT NULL, model text, account_selection text
);
CREATE TABLE IF NOT EXISTS fork_jira_automation_runs (
 rule_id text NOT NULL REFERENCES fork_jira_automations(id) ON DELETE CASCADE,
 task_id text NOT NULL, task_key text NOT NULL, workspace_id text, error text,
 created_at integer NOT NULL, PRIMARY KEY(rule_id, task_id)
);
CREATE TABLE IF NOT EXISTS fork_integration_settings (
 scope text PRIMARY KEY NOT NULL, broker_url text NOT NULL
);
CREATE TABLE IF NOT EXISTS fork_integration_connections (
 id text NOT NULL, scope text NOT NULL, provider text NOT NULL,
 metadata text NOT NULL, secret text, PRIMARY KEY(scope, id)
);
CREATE INDEX IF NOT EXISTS fork_integration_connections_scope ON fork_integration_connections(scope);
CREATE TABLE IF NOT EXISTS fork_integration_bindings (
 scope text NOT NULL, project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 repository text NOT NULL, connection_id text NOT NULL, remote text NOT NULL,
 PRIMARY KEY(scope, project_id)
);
CREATE TABLE IF NOT EXISTS fork_external_task_links (
 scope text NOT NULL, workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 task_key text NOT NULL, task text NOT NULL, PRIMARY KEY(scope, workspace_id, task_key)
);
CREATE TABLE IF NOT EXISTS fork_workspace_pull_requests (
 scope text NOT NULL, workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 pull_request text NOT NULL, PRIMARY KEY(scope, workspace_id)
);
CREATE TABLE IF NOT EXISTS chat_quota_recovery (
 workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 terminal_id text NOT NULL, switch_accounts integer NOT NULL, resume_at_reset integer NOT NULL,
 has_selection integer NOT NULL, native_session_id text, account_selection text, updated_at integer NOT NULL,
 PRIMARY KEY(workspace_id,terminal_id)
);
CREATE TABLE IF NOT EXISTS \`agent_account_aliases\` (
	\`agent\` text NOT NULL,
	\`selection\` text NOT NULL,
	\`label\` text NOT NULL,
	PRIMARY KEY(\`agent\`, \`selection\`)
);
CREATE TABLE IF NOT EXISTS \`session_lineage_nodes\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`organization_id\` text NOT NULL,
	\`workspace_id\` text NOT NULL,
	\`agent\` text NOT NULL,
	\`session_id\` text NOT NULL,
	\`store_root\` text NOT NULL,
	\`reference\` text NOT NULL,
	\`cwd\` text NOT NULL,
	\`config_id\` text NOT NULL,
	\`label\` text NOT NULL,
	\`profile_override\` text,
	\`last_terminal_id\` text,
	\`created_at\` integer NOT NULL,
	FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspaces\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS \`session_lineage_nodes_native_idx\` ON \`session_lineage_nodes\` (\`organization_id\`,\`workspace_id\`,\`agent\`,\`session_id\`,\`store_root\`);
CREATE TABLE IF NOT EXISTS \`session_lineage_edges\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`organization_id\` text NOT NULL,
	\`workspace_id\` text NOT NULL,
	\`source_node_id\` text NOT NULL,
	\`target_node_id\` text NOT NULL,
	\`provider\` text NOT NULL,
	\`warnings\` text NOT NULL,
	\`created_at\` integer NOT NULL,
	FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspaces\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`source_node_id\`) REFERENCES \`session_lineage_nodes\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`target_node_id\`) REFERENCES \`session_lineage_nodes\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS \`session_lineage_edges_workspace_idx\` ON \`session_lineage_edges\` (\`organization_id\`,\`workspace_id\`,\`created_at\`,\`id\`);
CREATE INDEX IF NOT EXISTS \`session_lineage_edges_source_idx\` ON \`session_lineage_edges\` (\`source_node_id\`);
CREATE INDEX IF NOT EXISTS \`session_lineage_edges_target_idx\` ON \`session_lineage_edges\` (\`target_node_id\`);
CREATE TABLE IF NOT EXISTS \`background_chats\` (
	\`terminal_id\` text PRIMARY KEY NOT NULL,
	\`workspace_id\` text NOT NULL,
	\`title\` text NOT NULL,
	\`pane_data\` text NOT NULL,
	\`parked_at\` integer NOT NULL,
	FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspaces\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS \`background_chats_workspace_idx\` ON \`background_chats\` (\`workspace_id\`,\`parked_at\`);
`;

/** Creates the tables in fork-schema.ts. Runs after upstream migrations. */
export function ensureForkTables(sqlite: { exec(sql: string): unknown }): void {
	sqlite.exec(FORK_TABLES_SQL);
}
