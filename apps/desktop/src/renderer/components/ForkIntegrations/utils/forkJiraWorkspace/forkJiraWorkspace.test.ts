import { expect, test } from "bun:test";
import type { ForkTask } from "@superset/shared/fork-integrations";
import { useNewWorkspacePromptContextStore } from "renderer/stores/new-workspace-prompt-context/store";
import {
	forkJiraLinkedIssue,
	forkJiraPromptSections,
} from "./forkJiraWorkspace";

test("a Jira issue started in a workspace reaches the agent prompt with its text", () => {
	const issue = forkJiraLinkedIssue({
		id: "10001",
		key: "APP-7",
		connectionId: "jira",
		title: "Fix login",
		description: "Steps:\n- open the page",
		url: "https://example.atlassian.net/browse/APP-7",
		status: { id: "1", name: "To Do", category: "new" },
		priority: null,
		assignee: null,
		labels: [],
	} satisfies ForkTask);
	const read = (key: string) => {
		const entry = useNewWorkspacePromptContextStore.getState().entries.get(key);
		return entry?.state === "ready" ? entry.body.text : null;
	};
	expect(forkJiraPromptSections([issue], read)).toEqual([
		"## Linked Jira issue — APP-7: Fix login\nhttps://example.atlassian.net/browse/APP-7\n\nSteps:\n- open the page",
	]);
	expect(
		forkJiraPromptSections([{ ...issue, source: "github" }], read),
	).toEqual([]);
});

test("issues with the same key on two Jira sites keep separate prompt bodies", () => {
	const base = {
		id: "1",
		key: "APP-1",
		title: "Fix",
		url: "https://example.atlassian.net/browse/APP-1",
		status: { id: "todo", name: "To Do", category: "new" },
		priority: null,
		assignee: null,
		labels: [],
	};
	const a = forkJiraLinkedIssue({
		...base,
		connectionId: "jira-a",
		description: "Site A",
	});
	const b = forkJiraLinkedIssue({
		...base,
		connectionId: "jira-b",
		description: "Site B",
	});
	const read = (key: string) => {
		const entry = useNewWorkspacePromptContextStore.getState().entries.get(key);
		return entry?.state === "ready" ? entry.body.text : null;
	};
	expect(forkJiraPromptSections([a], read)[0]).toContain("Site A");
	expect(forkJiraPromptSections([b], read)[0]).toContain("Site B");
});
