import type { ForkRepository } from "@superset/shared/fork-integrations";
import { TRPCError } from "@trpc/server";
import type { ForkApi } from "./fork-api";
import type { BBRepo, ForkPage } from "./fork-scm";

export async function forkBitbucketRepositories(
	api: ForkApi,
	id: string,
	cursor?: string,
	knownWorkspaces: string[] = [],
): Promise<ForkPage<ForkRepository>> {
	const legacy = cursor?.startsWith("/user/permissions/repositories?");
	const parts =
		!cursor || legacy
			? [1, 0, 1]
			: /^bb:(\d+):(\d+):(\d+)$/.exec(cursor)?.slice(1).map(Number);
	if (
		!parts ||
		parts.length !== 3 ||
		parts.some((part) => !Number.isSafeInteger(part) || part < 0 || part > 1000)
	)
		throw new TRPCError({ code: "BAD_REQUEST" });
	const [workspacePage = 1, workspaceIndex = 0, repositoryPage = 1] = parts;
	if (!workspacePage || !repositoryPage || workspaceIndex > 9)
		throw new TRPCError({ code: "BAD_REQUEST" });
	let workspaces: { values: { workspace: { slug: string } }[]; next?: string };
	try {
		workspaces = await api.request(
			id,
			`/user/workspaces?pagelen=10&page=${workspacePage}`,
		);
	} catch (error) {
		if (
			!(error instanceof TRPCError) ||
			error.code !== "FORBIDDEN" ||
			!knownWorkspaces.length
		)
			throw error;
		const slugs = [...new Set(knownWorkspaces)].sort();
		const offset = (workspacePage - 1) * 10;
		workspaces = {
			values: slugs
				.slice(offset, offset + 10)
				.map((slug) => ({ workspace: { slug } })),
			next: slugs.length > offset + 10 ? "next" : undefined,
		};
	}
	const workspace = workspaces.values[workspaceIndex]?.workspace.slug;
	if (!workspace) return { items: [], nextCursor: null };
	if (
		!/^[a-zA-Z0-9_.{}-]+$/.test(workspace) ||
		workspace === "." ||
		workspace === ".."
	)
		throw new TRPCError({ code: "BAD_GATEWAY" });
	const page = await api.request<{ values: BBRepo[]; next?: string }>(
		id,
		`/repositories/${encodeURIComponent(workspace)}?role=member&pagelen=100&page=${repositoryPage}&sort=-updated_on`,
	);
	const nextCursor = page.next
		? `bb:${workspacePage}:${workspaceIndex}:${repositoryPage + 1}`
		: workspaceIndex + 1 < workspaces.values.length
			? `bb:${workspacePage}:${workspaceIndex + 1}:1`
			: workspaces.next
				? `bb:${workspacePage + 1}:0:1`
				: null;
	return {
		items: page.values.map((repo) => ({
			provider: "bitbucket",
			host: "bitbucket.org",
			owner: repo.full_name.split("/")[0] ?? workspace,
			name: repo.slug,
			id: repo.uuid,
			fullName: repo.full_name,
			url: repo.links.html.href,
			cloneUrl:
				repo.links.clone.find((link) => link.name === "https")?.href ??
				`https://bitbucket.org/${repo.full_name}.git`,
			defaultBranch: repo.mainbranch?.name ?? null,
			connectionId: id,
		})),
		nextCursor,
	};
}
