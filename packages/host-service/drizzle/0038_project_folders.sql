CREATE TABLE `project_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`path` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`isolate_in_worktrees` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_folders_project_id_idx` ON `project_folders` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_folders_project_path_unique` ON `project_folders` (`project_id`,`path`);--> statement-breakpoint
CREATE TABLE `workspace_folder_worktrees` (
	`workspace_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`worktree_path` text NOT NULL,
	`branch` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `folder_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `project_folders`(`id`) ON UPDATE no action ON DELETE cascade
);
