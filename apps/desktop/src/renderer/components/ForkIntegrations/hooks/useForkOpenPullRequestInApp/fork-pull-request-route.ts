import {
	forkPullRequestRefFromUrl,
	forkPullRequestTarget,
} from "renderer/lib/fork-pull-request-ref";

export function forkPullRequestRoute(
	url: string,
	projects: readonly { projectKey: string; repoUrl: string | null }[],
	projectId?: string | null,
) {
	const ref = forkPullRequestRefFromUrl(url);
	if (!ref) return null;
	const project = projectId ?? forkPullRequestTarget(ref, projects)?.projectId;
	if (!project) return null;
	return {
		to: "/pull-requests/$prNumber" as const,
		params: { prNumber: String(ref.number) },
		search: { forkProvider: "bitbucket" as const, project },
	};
}
