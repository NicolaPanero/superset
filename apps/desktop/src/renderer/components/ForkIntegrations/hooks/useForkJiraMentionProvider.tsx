import { useLingui } from "@lingui/react/macro";
import type {
	ComposerMentionEntry,
	ComposerMentionProvider,
} from "@superset/chat-ui/PromptInput";
import { useMemo } from "react";
import { ForkProviderIcon } from "../components/ForkProviderIcon";
import { useForkJiraSearch } from "./useForkJiraSearch";

/** @mention Jira issues in the chat composer: the agent gets key, title and link. */
export function useForkJiraMentionProvider(): ComposerMentionProvider[] {
	const { t } = useLingui();
	const search = useForkJiraSearch();
	return useMemo(() => {
		if (!search) return [];
		return [
			{
				id: "jira",
				title: t({ message: "Jira issues" }),
				priority: 3,
				source: {
					kind: "search",
					search: async (query: string) =>
						(await search(query)).map(
							(task): ComposerMentionEntry => ({
								id: `jira:${task.connectionId}:${task.key}`,
								label: `${task.key} ${task.title}`,
								description: task.status.name,
								icon: <ForkProviderIcon provider="jira" className="size-4" />,
								select: (ctx) =>
									ctx.insertChip({
										label: task.key,
										serialized: `${task.key} "${task.title}" (${task.url})`,
									}),
							}),
						),
					emptyState: t({ message: "No matching issues" }),
				},
			},
		];
	}, [search, t]);
}
