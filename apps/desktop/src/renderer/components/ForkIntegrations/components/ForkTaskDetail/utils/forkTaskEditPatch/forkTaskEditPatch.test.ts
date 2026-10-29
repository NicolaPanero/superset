import { describe, expect, test } from "bun:test";
import type { ForkTask } from "@superset/shared/fork-integrations";
import {
	forkTaskDraft,
	forkTaskEditConflicts,
	forkTaskEditPatch,
} from "./forkTaskEditPatch";

const task = (patch: Partial<ForkTask> = {}): ForkTask => ({
	id: "1",
	key: "APP-1",
	connectionId: "jira",
	title: "Old title",
	description: "Body",
	url: "https://example.atlassian.net/browse/APP-1",
	status: { id: "1", name: "To Do", category: "new" },
	priority: "High",
	priorityId: "2",
	assignee: { id: "u1", name: "Ann" },
	labels: ["a", "b"],
	type: null,
	parent: null,
	sprint: null,
	...patch,
});

describe("forkTaskEditPatch", () => {
	test("an unchanged draft sends nothing", () => {
		const base = forkTaskDraft(task());
		expect(forkTaskEditPatch({ base, draft: { ...base } })).toEqual({});
	});

	test("sends only the edited fields, never the untouched title", () => {
		const base = forkTaskDraft(task());
		const patch = forkTaskEditPatch({
			base,
			draft: { ...base, labels: "a, c", assigneeId: "" },
		});
		expect(patch).toEqual({ labels: ["a", "c"], assigneeId: null });
	});

	test("label spacing alone is not a change", () => {
		const base = forkTaskDraft(task());
		expect(
			forkTaskEditPatch({ base, draft: { ...base, labels: "a,b" } }),
		).toEqual({});
	});
});

describe("forkTaskEditConflicts", () => {
	test("reports a patched field changed in Jira meanwhile", () => {
		const base = forkTaskDraft(task());
		const patch = forkTaskEditPatch({
			base,
			draft: { ...base, title: "Mine" },
		});
		const fresh = task({ title: "Theirs", description: "Changed too" });
		expect(forkTaskEditConflicts({ base, fresh, patch })).toEqual(["title"]);
	});

	test("ignores remote changes to fields the user did not edit", () => {
		const base = forkTaskDraft(task());
		const patch = forkTaskEditPatch({
			base,
			draft: { ...base, description: "Mine" },
		});
		expect(
			forkTaskEditConflicts({ base, fresh: task({ title: "Theirs" }), patch }),
		).toEqual([]);
	});
});
