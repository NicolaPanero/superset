import {
	type ForkConnection,
	parseForkRemote,
} from "@superset/shared/fork-integrations";
import { eq } from "drizzle-orm";
import { forkIntegrationBindings } from "../db/fork-schema";
import { projects, workspaces } from "../db/schema";
import { createGitEnvResolver, createGitFactory } from "../runtime/git";
import type {
	CredentialProblem,
	GitCredentialProvider,
} from "../runtime/git/types";
import { getToolEnvironment } from "../terminal/clean-shell-env";
import { forkAccessSecret } from "./fork-oauth";
import type { ForkConnectionStore } from "./fork-store";

export class ForkGitCredentialProvider implements GitCredentialProvider {
	constructor(
		readonly fallback: GitCredentialProvider,
		readonly store: ForkConnectionStore,
		readonly preferredId?: string,
		readonly environment = getToolEnvironment,
	) {}
	forPath(path: string) {
		const project = this.store.db
			.select({ id: projects.id })
			.from(projects)
			.where(eq(projects.repoPath, path))
			.get();
		const workspace = project
			? undefined
			: this.store.db
					.select({ projectId: workspaces.projectId })
					.from(workspaces)
					.where(eq(workspaces.worktreePath, path))
					.get();
		const projectId = project?.id ?? workspace?.projectId;
		const binding = projectId
			? this.store.db
					.select()
					.from(forkIntegrationBindings)
					.where(eq(forkIntegrationBindings.scope, this.store.scope))
					.all()
					.find((b) => b.projectId === projectId)
			: undefined;
		return new ForkGitCredentialProvider(
			this.fallback,
			this.store,
			binding?.connectionId ?? this.preferredId,
			this.environment,
		);
	}
	select(provider: "github" | "bitbucket", id?: string): ForkConnection | null {
		const rows = this.store.list().filter((c) => c.provider === provider);
		const explicit = id ?? this.preferredId;
		if (explicit) {
			const selected = rows.find((c) => c.id === explicit);
			if (explicit === "system:github" && !selected && provider === "github")
				return null;
			if (!selected?.enabled)
				throw new Error("Reconnect the selected account in Fork Settings");
			return selected.mode === "system" ? null : selected;
		}
		const enabled = rows.filter((c) => c.enabled);
		const primary = rows.find((c) => c.isDefault);
		if (primary && !primary.enabled)
			throw new Error("Select a default connection in Fork Settings");
		if (primary) return primary.mode === "system" ? null : primary;
		const managed = enabled.filter((c) => c.mode !== "system");
		if (managed.length > 1)
			throw new Error("Select a default connection in Fork Settings");
		const [onlyManaged] = managed;
		if (managed.length === 1 && onlyManaged) return onlyManaged;
		if (
			rows.some((c) => c.mode === "system" && !c.enabled) ||
			(provider === "bitbucket" && rows.length > 0)
		) {
			throw new Error("Reconnect this account in Fork Settings");
		}
		return null;
	}
	async getCredentials(remoteUrl: string | null) {
		const ref = remoteUrl ? parseForkRemote(remoteUrl) : null;
		if (!ref || !remoteUrl?.startsWith("https://"))
			return this.fallback.getCredentials(remoteUrl);
		const env = {
			...(await this.environment()),
			GIT_TERMINAL_PROMPT: "0",
			GIT_ASKPASS: "",
			GIT_CONFIG_COUNT: "4",
			GIT_CONFIG_KEY_0: `http.https://${ref.host}/.extraheader`,
			GIT_CONFIG_VALUE_0: "",
			GIT_CONFIG_KEY_1: `http.https://${ref.host}/.extraheader`,
			GIT_CONFIG_VALUE_1: "",
			GIT_CONFIG_KEY_2: "credential.helper",
			GIT_CONFIG_VALUE_2: "",
			GIT_CONFIG_KEY_3: "core.askPass",
			GIT_CONFIG_VALUE_3: "",
		};
		try {
			const connection = this.select(ref.provider, this.preferredId);
			if (!connection) return this.fallback.getCredentials(remoteUrl);
			const secret = await forkAccessSecret(this.store, connection.id);
			if (!secret.token) return { env };
			const username =
				ref.provider === "github"
					? "x-access-token"
					: connection.mode === "oauth"
						? "x-token-auth"
						: "x-bitbucket-api-token-auth";
			env.GIT_CONFIG_VALUE_1 =
				"Authorization: Basic " +
				Buffer.from(`${username}:${secret.token}`).toString("base64");
		} catch {}
		return { env };
	}

	async getToken(host: string) {
		const provider =
			host === "github.com"
				? "github"
				: host === "bitbucket.org"
					? "bitbucket"
					: null;
		if (!provider) return this.fallback.getToken(host);
		try {
			const selected = this.select(provider);
			return selected
				? ((await forkAccessSecret(this.store, selected.id)).token ?? null)
				: this.fallback.getToken(host);
		} catch {
			return null;
		}
	}
	credentialRemedy(host: string, problem: CredentialProblem): string {
		return this.store
			.list()
			.some(
				(c) => c.provider === (host === "github.com" ? "github" : "bitbucket"),
			)
			? "Check this account in Fork Settings"
			: this.fallback.credentialRemedy(host, problem);
	}
}

export function forkGitFactory(
	credentials: GitCredentialProvider,
): ReturnType<typeof createGitFactory> {
	return async (path, options) =>
		createGitFactory(
			credentials instanceof ForkGitCredentialProvider
				? credentials.forPath(path)
				: credentials,
		)(path, options);
}
export function forkGitEnvResolver(
	credentials: GitCredentialProvider,
): ReturnType<typeof createGitEnvResolver> {
	return (path) =>
		createGitEnvResolver(
			credentials instanceof ForkGitCredentialProvider
				? credentials.forPath(path)
				: credentials,
		)(path);
}
