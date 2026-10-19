import type { HostServiceContext } from "../types";
import { forkScmProjects } from "./fork-projects";
import { forkServices } from "./fork-services";

const TTL_MS = 5 * 60_000;
const cache = new Map<
	string,
	{ at: number; logins: Promise<{ login: string }[]> }
>();

/**
 * Pull request authors of a Bitbucket project, for the author filter. Null
 * for any other project, which keeps the GitHub contributor list.
 */
export async function forkBitbucketContributors(
	ctx: HostServiceContext,
	projectId: string,
): Promise<{ login: string }[] | null> {
	const [project] = await forkScmProjects(ctx, [projectId]);
	if (project?.repository.provider !== "bitbucket") return null;
	const { scm, store } = forkServices(ctx);
	const accounts = store
		.list()
		.filter((c) => c.provider === "bitbucket" && c.enabled);
	const connectionId =
		project.connectionId ??
		accounts.find((c) => c.isDefault)?.id ??
		(accounts.length === 1 ? accounts[0]?.id : undefined);
	if (!connectionId) return [];
	const key = `${connectionId}:${project.repository.owner}/${project.repository.name}`;
	const cached = cache.get(key);
	if (cached && Date.now() - cached.at < TTL_MS) return cached.logins;
	const logins = scm
		.searchBitbucket(connectionId, project.repository, {
			includeClosed: true,
			page: 1,
			limit: 50,
		})
		.then((page) =>
			[...new Set(page.items.map((pr) => pr.author))].map((login) => ({
				login,
			})),
		)
		.catch(() => {
			cache.delete(key);
			return [];
		});
	cache.set(key, { at: Date.now(), logins });
	return logins;
}
