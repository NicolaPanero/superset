import { expect, test } from "bun:test";
import type { ForkTask } from "@superset/shared/fork-integrations";
import { forkJiraColumnForStatus, forkJiraColumns } from "./forkJiraColumns";

const names = {
	new: "To do",
	indeterminate: "In progress",
	done: "Done",
	other: "Other statuses",
};
const open = { id: "open", name: "Open", category: "new" };
const testing = { id: "testing", name: "Testing", category: "indeterminate" };
const review = { id: "review", name: "Review", category: "indeterminate" };
const tasks = [open, testing, review].map((status) => ({
	status,
})) as ForkTask[];

test("a board groups workflow states without adding columns for them", () => {
	const configured = [
		{ id: "todo", name: "To Do", statusIds: ["open"] },
		{ id: "progress", name: "In Progress", statusIds: ["testing", "review"] },
		{ id: "done", name: "Done", statusIds: ["closed"] },
	];
	const columns = forkJiraColumns(tasks, configured, names);
	expect(columns).toEqual(configured);
	expect(forkJiraColumnForStatus(columns, testing)?.id).toBe("progress");
	expect(forkJiraColumnForStatus(columns, review)?.id).toBe("progress");
});
test("without settings grouping uses three stable status categories", () => {
	const columns = forkJiraColumns(tasks, undefined, names);
	expect(columns.map((column) => column.name)).toEqual([
		"To do",
		"In progress",
		"Done",
	]);
	expect(
		forkJiraColumnForStatus(columns, {
			id: "future",
			name: "Future status",
			category: "indeterminate",
		})?.id,
	).toBe("indeterminate");
});
test("unmapped tasks remain visible without guessing a configured column", () => {
	const columns = forkJiraColumns(
		tasks,
		[{ id: "todo", name: "To Do", statusIds: ["open"] }],
		names,
	);
	expect(columns.at(-1)?.statusIds).toEqual(["testing", "review"]);
});
