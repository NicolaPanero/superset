import {
	createHash,
	randomBytes,
	randomUUID,
	timingSafeEqual,
} from "node:crypto";
import { createServer, type Server } from "node:http";
import type {
	ForkConnection,
	ForkProviderId,
} from "@superset/shared/fork-integrations";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { forkFetch, validateBrokerUrl } from "./fork-http";
import type { ForkConnectionStore, ForkSecret } from "./fork-store";

const metadataSchema = z.object({
	version: z.literal(1),
	providers: z.array(z.enum(["github", "bitbucket", "jira"])),
	authorization_endpoint: z.string().url(),
	token_endpoint: z.string().url(),
	revocation_endpoint: z.string().url().optional(),
});
const tokenSchema = z.object({
	provider: z.enum(["github", "bitbucket", "jira"]),
	access_token: z.string().min(1),
	refresh_token: z.string().min(1).optional(),
	expires_in: z.number().positive().optional(),
	site: z.string().url().optional(),
	cloud_id: z.string().optional(),
});
export type ForkBrokerMetadata = z.infer<typeof metadataSchema>;
interface Attempt {
	scope: string;
	state: string;
	verifier: string;
	providers: ForkProviderId[];
	server: Server;
	timer: ReturnType<typeof setTimeout>;
	status: "pending" | "exchanging" | "complete" | "error";
	message: string | null;
	connectionIds: string[];
}
const attempts = new Map<string, Attempt>();

export async function discoverForkBroker(
	value: string,
): Promise<ForkBrokerMetadata> {
	const base = validateBrokerUrl(value);
	const metadata = metadataSchema.parse(
		await forkFetch(`${base}/.well-known/superset-oauth`),
	);
	for (const endpoint of [
		metadata.authorization_endpoint,
		metadata.token_endpoint,
		metadata.revocation_endpoint,
	].filter((value): value is string => Boolean(value))) {
		if (new URL(endpoint).origin !== new URL(base).origin)
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "OAuth endpoints must belong to the configured service",
			});
	}
	return metadata;
}
function persistGrant(
	store: ForkConnectionStore,
	brokerUrl: string,
	grant: z.infer<typeof tokenSchema>,
	reconnectId?: string,
) {
	const existing = reconnectId ? store.get(reconnectId)?.connection : undefined;
	const connection =
		existing ?? store.create(grant.provider, "oauth", grant.site ?? null);
	const next: ForkConnection = {
		...connection,
		enabled: true,
		brokerUrl,
		site: grant.site ?? null,
		state: "configured",
		expiresAt: grant.expires_in ? Date.now() + grant.expires_in * 1000 : null,
		error: null,
	};
	store.save(next, {
		token: grant.access_token,
		refreshToken: grant.refresh_token,
		cloudId: grant.cloud_id,
	});
	return next.id;
}
export async function startForkOAuth(
	store: ForkConnectionStore,
	value: string,
	providers: ForkProviderId[],
	reconnectId?: string,
) {
	const reconnect = reconnectId
		? store.get(reconnectId)?.connection
		: undefined;
	if (reconnectId) {
		const previous = store.get(reconnectId)?.connection;
		if (
			!previous ||
			previous.mode !== "oauth" ||
			providers.length !== 1 ||
			previous.provider !== providers[0]
		)
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Invalid connection",
			});
	}
	if (
		[...attempts.values()].filter(
			(a) =>
				a.scope === store.scope &&
				(a.status === "pending" || a.status === "exchanging"),
		).length >= 4
	)
		throw new TRPCError({
			code: "TOO_MANY_REQUESTS",
			message: "Complete the pending authorization first",
		});
	const brokerUrl = validateBrokerUrl(value);
	const metadata = await discoverForkBroker(brokerUrl);
	if (
		providers.length === 0 ||
		providers.some((p) => !metadata.providers.includes(p))
	)
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "The service does not support the selected providers",
		});
	const id = randomUUID(),
		state = randomBytes(32).toString("base64url"),
		verifier = randomBytes(32).toString("base64url");
	const server = createServer((request, response) => {
		void (async () => {
			const callback = new URL(request.url ?? "/", "http://127.0.0.1");
			const supplied = Buffer.from(callback.searchParams.get("state") ?? "");
			const expected = Buffer.from(state);
			if (
				callback.pathname !== "/callback" ||
				supplied.length !== expected.length ||
				!timingSafeEqual(supplied, expected)
			) {
				response.writeHead(400).end("Invalid authorization request");
				return;
			}
			const attempt = attempts.get(id);
			if (!attempt || attempt.status !== "pending") {
				response.writeHead(410).end("Authorization expired");
				return;
			}
			attempt.status = "exchanging";
			try {
				const code = callback.searchParams.get("code");
				if (!code || callback.searchParams.has("error"))
					throw new Error("Authorization was not completed");
				const data = z
					.object({ connections: z.array(tokenSchema).min(1) })
					.parse(
						await forkFetch(metadata.token_endpoint, {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({
								grant_type: "authorization_code",
								code,
								code_verifier: verifier,
								redirect_uri: redirectUri,
							}),
						}),
					);
				if (data.connections.some((c) => !providers.includes(c.provider)))
					throw new Error("Unexpected provider");
				if (
					new Set(data.connections.map((c) => c.provider)).size !==
					data.connections.length
				)
					throw new Error("Duplicate provider");
				for (const grant of data.connections) {
					if (
						grant.provider === "jira" &&
						(!grant.site ||
							!/^https:\/\/[a-z0-9-]+\.atlassian\.net\/?$/i.test(grant.site) ||
							!grant.cloud_id)
					)
						throw new Error("Invalid Jira grant");
				}
				if (
					reconnectId &&
					store.get(reconnectId)?.connection.revision !== reconnect?.revision
				)
					throw new Error("Connection changed");
				if (
					reconnect?.site &&
					data.connections.some(
						(c) =>
							c.provider === "jira" &&
							c.site?.replace(/\/$/, "") !== reconnect.site?.replace(/\/$/, ""),
					)
				)
					throw new Error("Select the original Jira site");
				attempt.connectionIds = store.db.transaction(() =>
					data.connections.map((c) =>
						persistGrant(store, brokerUrl, c, reconnectId),
					),
				);
				attempt.status = "complete";
				response
					.writeHead(200, {
						"content-type": "text/plain; charset=utf-8",
						"cache-control": "no-store",
					})
					.end("Connected. You can return to Superset.");
			} catch {
				attempt.status = "error";
				attempt.message = "OAuth authorization failed";
				response
					.writeHead(400)
					.end("Authorization failed. Return to Superset and try again.");
			} finally {
				server.close();
			}
		})().catch(() => response.destroy());
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const address = server.address();
	if (!address || typeof address === "string") {
		server.close();
		throw new Error("Could not open OAuth callback");
	}
	const redirectUri = `http://127.0.0.1:${address.port}/callback`;
	const timer = setTimeout(() => {
		server.close();
		attempts.delete(id);
	}, 5 * 60_000);
	timer.unref();
	attempts.set(id, {
		scope: store.scope,
		state,
		verifier,
		providers,
		server,
		timer,
		status: "pending",
		message: null,
		connectionIds: [],
	});
	const url = new URL(metadata.authorization_endpoint);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", "superset-fork-desktop");
	url.searchParams.set("redirect_uri", redirectUri);
	url.searchParams.set("state", state);
	url.searchParams.set(
		"code_challenge",
		createHash("sha256").update(verifier).digest("base64url"),
	);
	url.searchParams.set("code_challenge_method", "S256");
	url.searchParams.set("providers", providers.join(" "));
	return { attemptId: id, url: url.href };
}
export function forkOAuthStatus(scope: string, id: string) {
	const a = attempts.get(id);
	if (!a || a.scope !== scope)
		return {
			status: "error" as const,
			message: "Authorization expired",
			connectionIds: [] as string[],
		};
	return {
		status: a.status,
		message: a.message,
		connectionIds: a.connectionIds,
	};
}
const refreshes = new Map<string, Promise<ForkSecret>>();
export async function forkAccessSecret(
	store: ForkConnectionStore,
	id: string,
): Promise<ForkSecret> {
	const row = store.get(id);
	if (!row?.connection.enabled)
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Connect an account in Fork Settings",
		});
	const { connection, secret } = row;
	if (!connection.expiresAt || connection.expiresAt > Date.now() + 60_000)
		return secret;
	if (!connection.brokerUrl || !secret.refreshToken)
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Reconnect this account in Fork Settings",
		});
	const key = `${store.scope}:${id}`;
	const current = refreshes.get(key);
	if (current) return current;
	const operation = (async () => {
		try {
			if (!connection.brokerUrl) throw new Error("OAuth service unavailable");
			const metadata = await discoverForkBroker(connection.brokerUrl);
			const grant = tokenSchema.parse(
				await forkFetch(metadata.token_endpoint, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						grant_type: "refresh_token",
						refresh_token: secret.refreshToken,
						provider: connection.provider,
					}),
				}),
			);
			if (grant.provider !== connection.provider)
				throw new Error("Unexpected provider");
			const fresh = {
				...secret,
				token: grant.access_token,
				refreshToken: grant.refresh_token ?? secret.refreshToken,
				cloudId: grant.cloud_id ?? secret.cloudId,
			};
			const latest = store.get(id);
			if (
				!latest?.connection.enabled ||
				latest.secret.refreshToken !== secret.refreshToken
			)
				throw new Error("Connection changed");
			store.save(
				{
					...latest.connection,
					state: latest.connection.identity ? "connected" : "configured",
					expiresAt: grant.expires_in
						? Date.now() + grant.expires_in * 1000
						: null,
					error: null,
				},
				fresh,
			);
			return fresh;
		} catch (error) {
			const latest = store.get(id);
			if (error instanceof TRPCError && error.code === "BAD_GATEWAY")
				throw error;
			if (
				latest?.connection.enabled &&
				latest.secret.refreshToken === secret.refreshToken
			)
				store.save({
					...latest.connection,
					state: "expired",
					error: "Reconnect this account in Fork Settings",
				});
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "Reconnect this account in Fork Settings",
			});
		}
	})().finally(() => refreshes.delete(key));
	refreshes.set(key, operation);
	return operation;
}
export async function revokeForkGrant(store: ForkConnectionStore, id: string) {
	const row = store.get(id);
	store.disconnect(id);
	if (!row?.connection.brokerUrl || !row.secret.refreshToken) return;
	const metadata = await discoverForkBroker(row.connection.brokerUrl);
	if (metadata.revocation_endpoint)
		await forkFetch(metadata.revocation_endpoint, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				token: row.secret.refreshToken,
				provider: row.connection.provider,
			}),
		});
}
