import { msg } from "@lingui/core/macro";
import { LuListTodo } from "react-icons/lu";
import { useForkJiraFilters } from "renderer/stores/fork-jira-filters";
import type { CommandProvider } from "../../core/types";

export const forkJiraProvider: CommandProvider = {
	id: "fork-jira",
	provide: () => [
		{
			id: "fork.jira.myIssues",
			title: msg({ message: "My Jira issues" }),
			section: "navigation",
			icon: LuListTodo,
			keywords: ["jira", "issues", "tasks", "assigned", "mine"],
			run: (ctx) => {
				useForkJiraFilters.getState().remember({
					forkScope: "mine",
					forkStatus: "open",
				});
				ctx.navigate("/tasks");
			},
		},
	],
};
