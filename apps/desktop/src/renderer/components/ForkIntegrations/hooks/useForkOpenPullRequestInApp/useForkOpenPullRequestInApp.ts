import { useNavigate } from "@tanstack/react-router";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { usePullRequestsSplitViewStore } from "renderer/routes/_authenticated/_dashboard/pull-requests/stores/pullRequestsSplitViewStore";
import { forkPullRequestRoute } from "./fork-pull-request-route";

export function useForkOpenPullRequestInApp(projectId?: string | null) {
	const navigate = useNavigate();
	const { projects } = useHostProjects();
	return (url: string) => {
		const route = forkPullRequestRoute(url, projects, projectId);
		if (!route) return false;
		usePullRequestsSplitViewStore.getState().expandDetail();
		void navigate(route);
		return true;
	};
}
