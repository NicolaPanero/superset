import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { forkPullRequestTarget } from "renderer/lib/fork-pull-request-ref";
import { useProjectHost } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectHost";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";

export function useForkPullRequestPaneTarget(data: {
	repoFullName: string;
	number: number;
}) {
	const { workspace, hostUrl } = useWorkspace();
	const { projects } = useHostProjects();
	const candidates = [...projects].sort(
		(a, b) =>
			Number(b.projectKey === workspace.projectId) -
			Number(a.projectKey === workspace.projectId),
	);
	const projectId =
		forkPullRequestTarget({ ...data, forkProvider: "bitbucket" }, candidates)
			?.projectId ?? workspace.projectId;
	const { hostId } = useProjectHost(projectId);
	const targetUrl = useHostUrl(hostId);
	return {
		projectId,
		hostUrl: projectId === workspace.projectId ? hostUrl : targetUrl,
	};
}
