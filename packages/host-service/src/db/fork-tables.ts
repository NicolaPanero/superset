const FORK_TABLES_SQL = `
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
`;

/** Creates the tables in fork-schema.ts. Runs after upstream migrations. */
export function ensureForkTables(sqlite: { exec(sql: string): unknown }): void {
	sqlite.exec(FORK_TABLES_SQL);
}
