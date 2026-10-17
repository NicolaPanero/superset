import { useParams, useSearch } from "@tanstack/react-router";
import { type ComponentType, createElement } from "react";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useProjectHost } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectHost";
import { ForkPullRequests } from "../ForkPullRequests/ForkPullRequests";

export function withForkPullRequest(GitHubDetail: ComponentType) {
	return function ForkPullRequestRoute() {
		const { prNumber } = useParams({ strict: false }) as { prNumber?: string };
		const { forkProvider, project } = useSearch({ strict: false }) as {
			forkProvider?: string;
			project?: string;
		};
		const { hostId } = useProjectHost(project ?? null);
		const hostUrl = useHostUrl(hostId);
		const number = Number(prNumber);
		return forkProvider === "bitbucket" &&
			project &&
			Number.isSafeInteger(number) &&
			number > 0 ? (
			<ForkPullRequests
				key={`${hostUrl}:${project}:${number}`}
				projectId={project}
				number={number}
				hostUrl={hostUrl}
			/>
		) : (
			createElement(GitHubDetail)
		);
	};
}
