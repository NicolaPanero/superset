import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { parseForkRemote } from "@superset/shared/fork-integrations";

export function forkSidebarRepository(remote?: string | null) {
	const repository = parseForkRemote(remote ?? "");
	return repository?.provider === "bitbucket"
		? {
				repoUrl: `https://bitbucket.org/${repository.owner}/${repository.name}`,
				branchExistsOnRemote: true,
			}
		: {};
}

export function forkBranchBrowserLink(remote: string, branch: string) {
	const repository = forkSidebarRepository(remote);
	return repository.repoUrl
		? {
				href: `${repository.repoUrl}/src/${encodeURIComponent(branch)}/`,
				title: i18n._(msg({ message: "View on Bitbucket" })),
			}
		: {};
}
