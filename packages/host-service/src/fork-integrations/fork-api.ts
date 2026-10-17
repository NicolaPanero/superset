import type {
	ForkConnection,
	ForkIdentity,
} from "@superset/shared/fork-integrations";
import {
	FORK_PROVIDER_DEFINITIONS,
	isForkServiceUnavailable,
} from "@superset/shared/fork-integrations";
import { TRPCError } from "@trpc/server";
import type { GitCredentialProvider } from "../runtime/git";
import { forkAvailability } from "./fork-availability";
import { forkFetch } from "./fork-http";
import { forkAccessSecret } from "./fork-oauth";
import type { ForkConnectionStore } from "./fork-store";

export const SYSTEM_GITHUB = "system:github";
export class ForkApi {
	constructor(
		readonly store: ForkConnectionStore,
		readonly credentials: GitCredentialProvider,
		readonly transport: typeof forkFetch = forkFetch,
	) {}
	connection(id: string): ForkConnection {
		const connection = this.store.get(id)?.connection;
		if (connection) {
			if (!connection.enabled)
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "This connection is disabled",
				});
			return connection;
		}
		if (id !== SYSTEM_GITHUB)
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Connection not found",
			});
		return {
			id,
			provider: "github",
			mode: "system",
			site: "https://github.com",
			label: "GitHub",
			enabled: true,
			state: "configured",
			identity: null,
			source: "system",
			error: null,
			expiresAt: null,
			verifiedAt: null,
			brokerUrl: null,
		};
	}
	async auth(
		id: string,
	): Promise<{ base: string; headers: Record<string, string> }> {
		const c = this.connection(id);
		const secret =
			c.mode === "system"
				? {
						token: (await this.credentials.getToken("github.com")) ?? undefined,
					}
				: await forkAccessSecret(this.store, id);
		if (!secret.token)
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message: "Connect an account in Fork Settings",
			});
		const authorization =
			c.mode === "token" && c.provider !== "github"
				? `Basic ${Buffer.from(`${secret.email ?? ""}:${secret.token}`).toString("base64")}`
				: `Bearer ${secret.token}`;
		const headers = {
			authorization,
			accept: "application/json",
			"content-type": "application/json",
		};
		const definition = FORK_PROVIDER_DEFINITIONS[c.provider];
		if (definition.apiBase) return { base: definition.apiBase, headers };
		const cloudId = "cloudId" in secret ? secret.cloudId : undefined;
		if (cloudId)
			return {
				base: `https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}`,
				headers,
			};
		if (!c.site || !/^https:\/\/[^/]+\.atlassian\.net\/?$/.test(c.site))
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Configure a Jira Cloud site",
			});
		return { base: c.site.replace(/\/$/, ""), headers };
	}
	async request<T>(
		id: string,
		path: string,
		method = "GET",
		body?: unknown,
	): Promise<T> {
		if (!path.startsWith("/") || path.startsWith("//"))
			throw new Error("Invalid API path");
		return forkAvailability(this.store).run(this.connection(id), async () => {
			const { base, headers } = await this.auth(id);
			return this.transport<T>(`${base}${path}`, {
				method,
				headers,
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
			});
		});
	}
	async verify(id: string): Promise<ForkConnection> {
		const c = this.connection(id);
		try {
			if (
				c.mode === "system" &&
				"invalidateToken" in this.credentials &&
				typeof this.credentials.invalidateToken === "function"
			)
				this.credentials.invalidateToken("github.com");
			let identity: ForkIdentity;
			if (c.provider === "github") {
				const u = await this.request<{
					id: number;
					login: string;
					name: string | null;
					avatar_url: string;
				}>(id, "/user");
				identity = {
					id: String(u.id),
					login: u.login,
					name: u.name,
					avatarUrl: u.avatar_url,
				};
			} else if (c.provider === "bitbucket") {
				const u = await this.request<{
					uuid: string;
					username?: string;
					nickname: string;
					display_name: string;
					links: { avatar?: { href: string } };
				}>(id, "/user");
				identity = {
					id: u.uuid,
					login: u.username ?? u.nickname,
					name: u.display_name,
					avatarUrl: u.links.avatar?.href ?? null,
				};
			} else {
				const u = await this.request<{
					accountId: string;
					displayName: string;
					emailAddress?: string;
					avatarUrls?: Record<string, string>;
				}>(id, "/rest/api/3/myself");
				identity = {
					id: u.accountId,
					login: u.emailAddress ?? u.displayName,
					name: u.displayName,
					avatarUrl: u.avatarUrls?.["48x48"] ?? null,
				};
			}
			const source =
				c.mode === "system" &&
				"tokenSource" in this.credentials &&
				typeof this.credentials.tokenSource === "function"
					? (this.credentials.tokenSource("github.com") as string | null)
					: c.source;
			const next: ForkConnection = {
				...c,
				source,
				identity,
				state: "connected",
				error: null,
				verifiedAt: Date.now(),
			};
			const current = this.store.get(id)?.connection;
			if (current?.revision !== c.revision) return current ?? next;
			return this.store.save(next);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Connection failed";
			if (isForkServiceUnavailable(error)) return { ...c, error: message };
			const next: ForkConnection = {
				...c,
				state:
					error instanceof TRPCError && error.code === "UNAUTHORIZED"
						? "expired"
						: "error",
				error: message,
				verifiedAt: Date.now(),
			};
			const current = this.store.get(id)?.connection;
			if (current?.revision !== c.revision) return current ?? next;
			return this.store.save(next);
		}
	}
}
