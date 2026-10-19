import {
	type ForkTasksSearch,
	forkTasksSearch,
} from "renderer/components/ForkIntegrations/utils/forkRouteSearch";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** The Jira view to reopen; a fixed set of filters, never per issue. */
export type ForkJiraFilters = Pick<
	ForkTasksSearch,
	| "forkConnection"
	| "forkView"
	| "forkScope"
	| "forkStatus"
	| "forkJiraProject"
	| "forkSprint"
	| "forkIssueType"
	| "forkParent"
>;

const KEYS = [
	"forkConnection",
	"forkView",
	"forkScope",
	"forkStatus",
	"forkJiraProject",
	"forkSprint",
	"forkIssueType",
	"forkParent",
] as const;

function pickForkJiraFilters(search: Record<string, unknown>): ForkJiraFilters {
	const valid = forkTasksSearch(search);
	return Object.fromEntries(
		KEYS.filter((key) => key in search).map((key) => [key, valid[key]]),
	) as ForkJiraFilters;
}

export const useForkJiraFilters = create<{
	filters: ForkJiraFilters;
	remember: (patch: Record<string, unknown>) => void;
}>()(
	persist(
		(set) => ({
			filters: {},
			remember: (patch) =>
				set((state) => ({
					filters: { ...state.filters, ...pickForkJiraFilters(patch) },
				})),
		}),
		{
			name: "superset-fork-jira-filters",
			partialize: ({ filters }) => ({ filters }),
			merge: (saved, current) => {
				const filters =
					saved && typeof saved === "object" && "filters" in saved
						? saved.filters
						: null;
				return {
					...current,
					filters:
						filters && typeof filters === "object"
							? pickForkJiraFilters(filters as Record<string, unknown>)
							: {},
				};
			},
		},
	),
);
