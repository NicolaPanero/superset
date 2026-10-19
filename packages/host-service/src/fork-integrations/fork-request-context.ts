import { Octokit } from "@octokit/rest";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { projects, workspaces } from "../db/schema";
import type { HostServiceContext } from "../types";
import { ForkGitCredentialProvider } from "./fork-credentials";

export function forkRequestContext(
	ctx: HostServiceContext,
	input: unknown,
): HostServiceContext {
	if (
		!(ctx.credentials instanceof ForkGitCredentialProvider) ||
		!input ||
		typeof input !== "object"
	)
		return ctx;
	const value = input as { projectId?: unknown; workspaceId?: unknown };
	const projectId =
		typeof value.projectId === "string"
			? value.projectId
			: typeof value.workspaceId === "string"
				? ctx.db
						.select({ projectId: workspaces.projectId })
						.from(workspaces)
						.where(eq(workspaces.id, value.workspaceId))
						.get()?.projectId
				: null;
	if (!projectId) return ctx;
	const project = ctx.db
		.select({ path: projects.repoPath })
		.from(projects)
		.where(eq(projects.id, projectId))
		.get();
	if (!project) return ctx;
	const credentials = ctx.credentials.forProject(projectId);
	const transport = ctx.forkTransport;
	return {
		...ctx,
		credentials,
		execGh: (args, options) =>
			ctx.execGh(args, { ...options, cwd: options?.cwd ?? project.path }),
		github:
			credentials.preferredProvider !== "github" &&
			!credentials.store.list().some((account) => account.provider === "github")
				? ctx.github
				: async () => {
						const token = await credentials.getToken("github.com");
						if (!token)
							throw new TRPCError({
								code: "PRECONDITION_FAILED",
								message: credentials.credentialRemedy("github.com", "missing"),
							});
						return new Octokit({
							auth: token,
							...(transport
								? {
										request: {
											fetch: async (url: string, init: RequestInit) => {
												const body = await transport(url, init);
												return new Response(JSON.stringify(body), {
													status: 200,
													headers: { "content-type": "application/json" },
												});
											},
										},
									}
								: {}),
						});
					},
	};
}
