import type { ComponentProps } from "react";
import { PullRequestPane } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/PullRequestPane/PullRequestPane";
import { ForkPullRequests } from "../ForkPullRequests/ForkPullRequests";
import { useForkPullRequestPaneTarget } from "./useForkPullRequestPaneTarget";

export function ForkWorkspacePullRequestPane(
	props: ComponentProps<typeof PullRequestPane>,
) {
	const { projectId, hostUrl } = useForkPullRequestPaneTarget(props.data);
	return props.data.forkProvider === "bitbucket" ? (
		<ForkPullRequests
			key={`${hostUrl}:${projectId}:${props.data.repoFullName}:${props.data.number}`}
			projectId={projectId ?? ""}
			repoFullName={props.data.repoFullName}
			number={props.data.number}
			hostUrl={hostUrl}
			embedded
		/>
	) : (
		<PullRequestPane {...props} />
	);
}
