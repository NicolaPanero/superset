import type { ForkTask } from "@superset/shared/fork-integrations";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import type { LinkedIssue } from "renderer/stores/new-workspace-draft";
import { useNewWorkspacePromptContextStore } from "renderer/stores/new-workspace-prompt-context/store";

const JIRA_SOURCE = "jira" as const;

/** The Jira connection behind each issue linked in a new-workspace draft. */
const pendingIssues = new Map<
	string,
	{ connectionId: string; taskId: string }
>();

const bodyKey = (key: string) => `jira-issue:${key}`;

/** Links the issue to a new-workspace draft and hands its text to the agent prompt. */
export function forkJiraLinkedIssue(task: ForkTask): LinkedIssue {
	pendingIssues.set(task.key, {
		connectionId: task.connectionId,
		taskId: task.id,
	});
	useNewWorkspacePromptContextStore.setState((state) => {
		const entries = new Map(state.entries);
		entries.set(bodyKey(task.key), {
			state: "ready",
			body: { text: task.description },
		});
		return { entries };
	});
	return {
		slug: task.key,
		title: task.title,
		source: JIRA_SOURCE,
		url: task.url,
	};
}

export function forkJiraPromptSections(
	issues: LinkedIssue[],
	readBody: (key: string) => string | null,
): string[] {
	return issues
		.filter((issue) => issue.source === JIRA_SOURCE)
		.map((issue) => {
			const header = [
				`## Linked Jira issue — ${issue.slug}: ${issue.title}`,
				...(issue.url ? [issue.url] : []),
			].join("\n");
			const body = readBody(bodyKey(issue.slug));
			return body ? `${header}\n\n${body}` : header;
		});
}

/** After the workspace exists: link its Jira issues and start them. */
export async function forkStartJiraWork(
	client: HostServiceClient,
	workspaceId: string,
	issues: LinkedIssue[],
): Promise<void> {
	await Promise.all(
		issues
			.filter((issue) => issue.source === JIRA_SOURCE && issue.url)
			.map((issue) => {
				const pending = pendingIssues.get(issue.slug);
				if (!pending) return undefined;
				pendingIssues.delete(issue.slug);
				return client.forkTasks.startWork
					.mutate({
						workspaceId,
						connectionId: pending.connectionId,
						taskId: pending.taskId,
						key: issue.slug,
						title: issue.title,
						url: issue.url ?? "",
					})
					.catch((error) =>
						console.warn("[fork-jira] could not start", issue.slug, error),
					);
			}),
	);
}
