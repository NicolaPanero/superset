CREATE TABLE `session_lineage_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`source_node_id` text NOT NULL,
	`target_node_id` text NOT NULL,
	`provider` text NOT NULL,
	`warnings` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_node_id`) REFERENCES `session_lineage_nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_node_id`) REFERENCES `session_lineage_nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_lineage_edges_workspace_idx` ON `session_lineage_edges` (`organization_id`,`workspace_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `session_lineage_edges_source_idx` ON `session_lineage_edges` (`source_node_id`);--> statement-breakpoint
CREATE INDEX `session_lineage_edges_target_idx` ON `session_lineage_edges` (`target_node_id`);--> statement-breakpoint
CREATE TABLE `session_lineage_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`agent` text NOT NULL,
	`session_id` text NOT NULL,
	`store_root` text NOT NULL,
	`reference` text NOT NULL,
	`cwd` text NOT NULL,
	`config_id` text NOT NULL,
	`label` text NOT NULL,
	`profile_override` text,
	`last_terminal_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_lineage_nodes_native_idx` ON `session_lineage_nodes` (`organization_id`,`workspace_id`,`agent`,`session_id`,`store_root`);