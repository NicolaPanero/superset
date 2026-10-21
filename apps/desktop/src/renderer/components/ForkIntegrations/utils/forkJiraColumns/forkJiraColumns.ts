import type {
	ForkJiraColumn,
	ForkTask,
} from "@superset/shared/fork-integrations";

export function forkJiraColumnForStatus(
	columns: ForkJiraColumn[],
	status: ForkTask["status"],
) {
	return (
		columns.find((column) => column.statusIds.includes(status.id)) ??
		columns.find((column) => column.category === status.category)
	);
}

export function forkJiraColumns(
	tasks: ForkTask[],
	configured: ForkJiraColumn[] | undefined,
	names: Record<"new" | "indeterminate" | "done" | "other", string>,
): ForkJiraColumn[] {
	const columns = configured?.length
		? configured
		: ["new", "indeterminate", "done"].map((category) => ({
				id: category,
				name: names[category as keyof typeof names],
				statusIds: [],
				category,
			}));
	const others = tasks.filter(
		(task) => !forkJiraColumnForStatus(columns, task.status),
	);
	return others.length
		? [
				...columns,
				{
					id: "other",
					name: names.other,
					statusIds: [...new Set(others.map((task) => task.status.id))],
				},
			]
		: columns;
}
