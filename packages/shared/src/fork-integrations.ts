export type ForkProviderId = "github" | "bitbucket" | "jira";
export type ForkConnectionMode = "token" | "oauth" | "system";
export interface ForkIdentity {
	id: string;
	login: string;
	name: string | null;
	avatarUrl: string | null;
}
export interface ForkConnection {
	id: string;
	provider: ForkProviderId;
	mode: ForkConnectionMode;
	label: string;
	site: string | null;
	identity: ForkIdentity | null;
	enabled: boolean;
	state: "configured" | "connected" | "expired" | "error" | "disconnected";
	source: string | null;
	error: string | null;
	verifiedAt: number | null;
	expiresAt: number | null;
	brokerUrl: string | null;
	isDefault?: boolean;
	revision?: number;
}
export interface ForkRepositoryRef {
	provider: "github" | "bitbucket";
	host: string;
	owner: string;
	name: string;
}
export interface ForkRepository extends ForkRepositoryRef {
	id: string;
	fullName: string;
	url: string;
	cloneUrl: string;
	defaultBranch: string | null;
	connectionId: string;
}
export interface ForkPullRequest {
	repository: ForkRepositoryRef;
	connectionId: string;
	number: number;
	title: string;
	description: string;
	url: string;
	state: "open" | "closed" | "merged";
	author: string;
	sourceBranch: string;
	targetBranch: string;
	headCommit: string;
	updatedAt: string;
	sourceRepository?: ForkRepositoryRef;
	mergeMethods?: string[];
	defaultMergeMethod?: string;
}
export interface ForkComment {
	id: string;
	author: string;
	body: string;
	createdAt: string;
	path?: string;
	line?: number;
}
export interface ForkTask {
	id: string;
	key: string;
	connectionId: string;
	title: string;
	description: string;
	url: string;
	status: { id: string; name: string; category: string };
	priority: string | null;
	priorityId?: string | null;
	assignee: { id: string; name: string } | null;
	labels: string[];
}
export interface ForkTaskLink {
	connectionId: string;
	taskId: string;
	key: string;
	title: string;
	url: string;
}
export const FORK_PROVIDERS = ["github", "bitbucket", "jira"] as const;
export const FORK_PROVIDER_DEFINITIONS = {
	github: {
		kind: "scm",
		host: "github.com",
		apiBase: "https://api.github.com",
		capabilities: [
			"repositories",
			"pullRequests",
			"reviews",
			"merge",
			"checks",
			"diff",
		],
	},
	bitbucket: {
		kind: "scm",
		host: "bitbucket.org",
		apiBase: "https://api.bitbucket.org/2.0",
		capabilities: [
			"repositories",
			"pullRequests",
			"reviews",
			"merge",
			"checks",
			"diff",
		],
	},
	jira: {
		kind: "tasks",
		host: null,
		apiBase: null,
		capabilities: [
			"tasks",
			"projects",
			"transitions",
			"comments",
			"workspaceLinks",
		],
	},
} as const satisfies Record<
	ForkProviderId,
	{
		kind: "scm" | "tasks";
		host: string | null;
		apiBase: string | null;
		capabilities: readonly string[];
	}
>;
export const FORK_INTEGRATIONS_VERSION = 1;

export function parseForkRemote(remote: string): ForkRepositoryRef | null {
	const normalized = remote.trim().replace(/^git@([^:]+):/, "ssh://git@$1/");
	let url: URL;
	try {
		url = new URL(normalized);
	} catch {
		return null;
	}
	if (!["https:", "ssh:", "git:"].includes(url.protocol)) return null;
	const host = url.hostname.toLowerCase();
	const provider =
		host === "github.com"
			? "github"
			: host === "bitbucket.org"
				? "bitbucket"
				: null;
	const parts = url.pathname
		.replace(/^\/+|\/+$/g, "")
		.replace(/\.git$/, "")
		.split("/");
	if (
		!provider ||
		parts.length !== 2 ||
		parts.some((p) => !p || p === "." || p === "..")
	)
		return null;
	return { provider, host, owner: parts[0]!, name: parts[1]! };
}
export function forkRepositoryKey(ref: ForkRepositoryRef): string {
	return [
		ref.provider,
		ref.host.toLowerCase(),
		ref.owner.toLowerCase(),
		ref.name.toLowerCase(),
	].join(":");
}
export function forkTaskBranch(key: string, title: string): string {
	const slug = title
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 60);
	return `feature/${key}-${slug || "task"}`;
}
