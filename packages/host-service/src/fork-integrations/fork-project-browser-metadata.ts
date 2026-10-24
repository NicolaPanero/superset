import type { HostServiceContext } from "../types";
import { forkScmProjects } from "./fork-projects";

export async function forkProjectBrowserMetadata<
	T extends {
		id: string;
		repoUrl: string | null;
		repoOwner: string | null;
		repoName: string | null;
	},
>(ctx: HostServiceContext, rows: T[]): Promise<T[]> {
	const repositories = new Map(
		(
			await forkScmProjects(
				ctx,
				rows.map((row) => row.id),
			)
		).map((project) => [project.projectId, project.repository]),
	);
	return rows.map((row) => {
		const repository = repositories.get(row.id);
		return repository?.provider === "bitbucket"
			? {
					...row,
					repoUrl: `https://bitbucket.org/${repository.owner}/${repository.name}`,
					repoOwner: null,
					repoName: null,
				}
			: row;
	});
}
