import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export type ForkAutomationSourceKind =
	| "jira"
	| "pr_comments"
	| "ci_failure"
	| "schedule";

export interface ForkAutomationTemplate {
	id: string;
	name: MessageDescriptor;
	description: MessageDescriptor;
	sourceKind: ForkAutomationSourceKind;
	prompt: string;
	targetLimit: number | null;
	retryLimit: number;
}

export const FORK_AUTOMATION_SOURCES: {
	kind: ForkAutomationSourceKind;
	label: MessageDescriptor;
	description: MessageDescriptor;
}[] = [
	{
		kind: "jira",
		label: msg({ message: "New Jira issue" }),
		description: msg({
			message:
				"Each issue that starts to match the query gets a new workspace.",
		}),
	},
	{
		kind: "pr_comments",
		label: msg({ message: "Pull request comments" }),
		description: msg({
			message:
				"New review comments on a pull request linked to a workspace of the project run the agent in that workspace.",
		}),
	},
	{
		kind: "ci_failure",
		label: msg({ message: "Failed checks" }),
		description: msg({
			message:
				"Failed checks on a linked pull request run the agent in its workspace, once per commit.",
		}),
	},
	{
		kind: "schedule",
		label: msg({ message: "Schedule" }),
		description: msg({
			message: "Runs on the chosen days at the chosen time in a new workspace.",
		}),
	},
];

export const FORK_AUTOMATION_TEMPLATES: ForkAutomationTemplate[] = [
	{
		id: "jira-triage",
		name: msg({ message: "Jira triage" }),
		description: msg({
			message: "Analysis, open questions and a plan. No ticket changes.",
		}),
		sourceKind: "jira",
		prompt:
			"Read the Jira issue and the code it concerns. Write a short analysis: what the issue asks for, where the change goes, the risks, and the questions that must be answered before work starts. Propose a step-by-step plan. Do not change the code, do not comment on the Jira issue and do not change its status.",
		targetLimit: null,
		retryLimit: 3,
	},
	{
		id: "pr-review-fixes",
		name: msg({ message: "Fix review comments" }),
		description: msg({
			message: "Makes the requested changes as commits. Posts no comments.",
		}),
		sourceKind: "pr_comments",
		prompt:
			"Review comments were added to this pull request. For each comment, decide if a change is needed. Make the needed changes, run the relevant tests, and commit with a clear message. Do not push and do not reply to the comments: list in your final message what you changed and which comments need an answer from a person.",
		targetLimit: 5,
		retryLimit: 2,
	},
	{
		id: "ci-fix",
		name: msg({ message: "Repair failed checks" }),
		description: msg({
			message:
				"Diagnoses the failure and tries a fix, at most twice per pull request.",
		}),
		sourceKind: "ci_failure",
		prompt:
			"Checks failed on this pull request. Find the cause from the check output and the recent changes. If the cause is in this branch, fix it, run the failing checks locally when possible, and commit. If the failure is not caused by this branch (flaky test, infrastructure), do not change the code and explain why in your final message. Do not push.",
		targetLimit: 2,
		retryLimit: 2,
	},
	{
		id: "daily-digest",
		name: msg({ message: "Daily digest" }),
		description: msg({
			message: "A summary file of tasks and pull requests that need attention.",
		}),
		sourceKind: "schedule",
		prompt:
			"Write DIGEST.md in the workspace root: a short summary for today of the Jira issues assigned to me that are open, the pull requests that wait for my review or have new comments, and anything blocked. Use the tools available to you to read Jira and the repository. Keep each item to one line with a link. Do not change anything else.",
		targetLimit: null,
		retryLimit: 2,
	},
];
