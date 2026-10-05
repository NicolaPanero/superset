CREATE TABLE `agent_account_aliases` (
	`agent` text NOT NULL,
	`selection` text NOT NULL,
	`label` text NOT NULL,
	PRIMARY KEY(`agent`, `selection`)
);
