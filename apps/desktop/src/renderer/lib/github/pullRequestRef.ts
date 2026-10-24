import {
	type ForkPullRequestIdentity,
	forkPullRequestRefFromUrl,
} from "renderer/lib/fork-pull-request-ref";
/** A pull request by its own identity: the repository it lives in and its number. */
export interface PullRequestRef extends ForkPullRequestIdentity {
	repoFullName: string;
	number: number;
}

const PULL_REQUEST_URL =
	/^https:\/\/github\.com\/([^/?#]+\/[^/?#]+)\/pull\/(\d+)(?:[/?#]|$)/;

export function pullRequestRefFromUrl(url: string): PullRequestRef | null {
	const fork = forkPullRequestRefFromUrl(url);
	if (fork) return fork;
	const match = PULL_REQUEST_URL.exec(url);
	if (!match?.[1] || !match[2]) return null;
	return { repoFullName: match[1], number: Number(match[2]) };
}

const BARE_PULL_REQUEST_URL =
	/^https:\/\/github\.com\/[^/?#]+\/[^/?#]+\/pull\/\d+\/?(?:\?[^#]*)?$/;

export function pullRequestRefFromBareUrl(url: string): PullRequestRef | null {
	const fork = forkPullRequestRefFromUrl(url, true);
	if (fork) return fork;
	return BARE_PULL_REQUEST_URL.test(url) ? pullRequestRefFromUrl(url) : null;
}

export function isSamePullRequest(
	left: PullRequestRef,
	right: PullRequestRef,
): boolean {
	return (
		left.forkProvider === right.forkProvider &&
		left.number === right.number &&
		left.repoFullName.toLowerCase() === right.repoFullName.toLowerCase()
	);
}
