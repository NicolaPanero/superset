import type { ForkTask } from "@superset/shared/fork-integrations";

export interface ForkTaskDraft {
	title: string;
	description: string;
	labels: string;
	assigneeId: string;
	priorityId: string;
}

export interface ForkTaskEditPatch {
	title?: string;
	description?: string;
	assigneeId?: string | null;
	priorityId?: string;
	labels?: string[];
}

export type ForkTaskEditField = keyof ForkTaskDraft;

export function forkTaskDraft(task: ForkTask): ForkTaskDraft {
	return {
		title: task.title,
		description: task.description,
		labels: task.labels.join(", "),
		assigneeId: task.assignee?.id ?? "",
		priorityId: task.priorityId ?? "",
	};
}

function parseLabels(value: string): string[] {
	return value
		.split(",")
		.map((label) => label.trim())
		.filter(Boolean);
}

function sameValue(field: ForkTaskEditField, a: string, b: string): boolean {
	if (field === "labels")
		return parseLabels(a).join("\n") === parseLabels(b).join("\n");
	if (field === "title") return a.trim() === b.trim();
	return a === b;
}

/** Only the fields the user changed since `base` was taken. */
export function forkTaskEditPatch({
	base,
	draft,
}: {
	base: ForkTaskDraft;
	draft: ForkTaskDraft;
}): ForkTaskEditPatch {
	const changed = (field: ForkTaskEditField) =>
		!sameValue(field, base[field], draft[field]);
	return {
		...(changed("title") ? { title: draft.title.trim() } : {}),
		...(changed("description") ? { description: draft.description } : {}),
		...(changed("labels") ? { labels: parseLabels(draft.labels) } : {}),
		...(changed("assigneeId") ? { assigneeId: draft.assigneeId || null } : {}),
		...(changed("priorityId") && draft.priorityId
			? { priorityId: draft.priorityId }
			: {}),
	};
}

const PATCH_FIELDS: Record<keyof ForkTaskEditPatch, ForkTaskEditField> = {
	title: "title",
	description: "description",
	labels: "labels",
	assigneeId: "assigneeId",
	priorityId: "priorityId",
};

/** Patched fields that someone else changed in Jira after `base` was taken. */
export function forkTaskEditConflicts({
	base,
	fresh,
	patch,
}: {
	base: ForkTaskDraft;
	fresh: ForkTask;
	patch: ForkTaskEditPatch;
}): ForkTaskEditField[] {
	const current = forkTaskDraft(fresh);
	return (Object.keys(patch) as (keyof ForkTaskEditPatch)[])
		.map((key) => PATCH_FIELDS[key])
		.filter((field) => !sameValue(field, base[field], current[field]));
}
