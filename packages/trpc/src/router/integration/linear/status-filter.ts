export const linearStatusFilterValues = [
	"all",
	"active",
	"backlog",
	"unstarted",
	"started",
	"completed",
	"canceled",
] as const;
export type LinearStatusFilter = (typeof linearStatusFilterValues)[number];
