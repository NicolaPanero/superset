import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import type { ForkPullRequestsSearch } from "../utils/forkRouteSearch";

/** Opens a Bitbucket pull request link as the pull request detail route. */
export function useForkPullRequestRedirect() {
	const search = useSearch({ strict: false }) as ForkPullRequestsSearch;
	const navigate = useNavigate();
	useEffect(() => {
		if (
			search.forkProvider === "bitbucket" &&
			search.forkNumber &&
			search.forkProject
		) {
			void navigate({
				to: "/pull-requests/$prNumber",
				params: { prNumber: String(search.forkNumber) },
				search: { forkProvider: "bitbucket", project: search.forkProject },
				replace: true,
			});
		}
	}, [navigate, search.forkProvider, search.forkNumber, search.forkProject]);
}
