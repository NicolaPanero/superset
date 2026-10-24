import { parseForkRemote } from "@superset/shared/fork-integrations";

export interface ForkPullRequestIdentity {
	forkProvider?: "bitbucket";
}

export function forkPullRequestRefFromUrl(url: string, bare = false) {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	if (parsed.protocol !== "https:" || parsed.hostname !== "bitbucket.org")
		return null;
	const match = /^\/([^/]+\/[^/]+)\/pull-requests\/([1-9]\d*)(\/.*)?$/.exec(
		parsed.pathname,
	);
	if (!match?.[1] || !match[2] || !Number.isSafeInteger(Number(match[2])))
		return null;
	if (bare && ((match[3] && match[3] !== "/") || parsed.hash)) return null;
	return {
		repoFullName: match[1],
		number: Number(match[2]),
		forkProvider: "bitbucket" as const,
	};
}

export function forkPullRequestIdentity(ref: ForkPullRequestIdentity) {
	return ref.forkProvider ? { forkProvider: ref.forkProvider } : {};
}

export function forkPullRequestUrl(
	ref: ForkPullRequestIdentity & { repoFullName: string; number: number },
) {
	return ref.forkProvider === "bitbucket"
		? `https://bitbucket.org/${ref.repoFullName}/pull-requests/${ref.number}`
		: null;
}

export function forkPullRequestTarget(
	ref: NonNullable<ReturnType<typeof forkPullRequestRefFromUrl>>,
	projects: readonly { projectKey: string; repoUrl?: string | null }[],
) {
	const fullName = ref.repoFullName.toLowerCase();
	const project = projects.find((candidate) => {
		const repository = parseForkRemote(candidate.repoUrl ?? "");
		return (
			repository?.provider === "bitbucket" &&
			`${repository.owner}/${repository.name}`.toLowerCase() === fullName
		);
	});
	return project ? { ref, projectId: project.projectKey } : null;
}
