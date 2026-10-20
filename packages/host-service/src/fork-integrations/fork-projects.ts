import {
	type ForkRepositoryRef,
	parseForkRemote,
} from "@superset/shared/fork-integrations";
import { eq } from "drizzle-orm";
import { forkIntegrationBindings } from "../db/fork-schema";
import { projects } from "../db/schema";
import type { HostServiceContext } from "../types";

export interface ForkScmProject {
	projectId: string;
	name: string;
	repository: ForkRepositoryRef;
	connectionId: string | null;
	remote: string;
}

export async function forkScmProjects(
	ctx: HostServiceContext,
	projectIds?: string[],
) {
	const bindings = ctx.db
		.select()
		.from(forkIntegrationBindings)
		.where(eq(forkIntegrationBindings.scope, ctx.organizationId))
		.all();
	const selected = projectIds ? new Set(projectIds) : null;
	const rows = await Promise.all(
		ctx.db
			.select()
			.from(projects)
			.all()
			.filter((p) => !p.deletedAt && (!selected || selected.has(p.id)))
			.map(async (p): Promise<ForkScmProject | null> => {
				const binding = bindings.find((b) => b.projectId === p.id);
				try {
					const remotes = await (await ctx.git(p.repoPath)).getRemotes(true);
					const found =
						remotes.find(
							(r) => r.name === (binding?.remote ?? p.remoteName ?? "origin"),
						) ??
						remotes.find((r) => r.name === "origin") ??
						remotes[0];
					const repository = parseForkRemote(found?.refs.fetch ?? "");
					if (!repository || !found) return null;
					return {
						projectId: p.id,
						name: p.name,
						repository,
						connectionId:
							binding?.repository.provider === repository.provider
								? binding.connectionId
								: null,
						remote: found.name,
					};
				} catch {
					return null;
				}
			}),
	);
	return rows.filter((p): p is ForkScmProject => p !== null);
}
