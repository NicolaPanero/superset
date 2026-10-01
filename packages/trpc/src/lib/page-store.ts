import { db } from "@superset/db/client";
import { members, pages } from "@superset/db/schema";
import {
	type PageStorageHubReplyFor,
	type PageStorageHubRequest,
	type PageStorageHubResponse,
	pageStorageOpPath,
} from "@superset/shared/page-storage-hub";
import { signPageStorageTicket } from "@superset/shared/usercontent";
import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { env } from "../env";

export type PageStorageFailure = "quota_exceeded" | "invalid" | "unavailable";

const PURGE_CONCURRENCY = 8;

function storageError(code: PageStorageFailure, message: string): TRPCError {
	return new TRPCError({
		code: code === "unavailable" ? "INTERNAL_SERVER_ERROR" : "FORBIDDEN",
		message,
		cause: { pageStorageCode: code },
	});
}

export async function callPageStore<Request extends PageStorageHubRequest>(
	pageId: string,
	request: Request,
): Promise<PageStorageHubReplyFor<Request["op"]>> {
	let response: Response;
	try {
		response = await fetch(`${env.REALTIME_URL}${pageStorageOpPath(pageId)}`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${env.REALTIME_NUDGE_SECRET}`,
				"content-type": "application/json",
			},
			body: JSON.stringify(request),
			signal: AbortSignal.timeout(10_000),
		});
	} catch (error) {
		throw storageError(
			"unavailable",
			`Page storage is unreachable: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}

	if (!response.ok) {
		throw storageError(
			"unavailable",
			`Page storage refused the call (${response.status})`,
		);
	}

	const body = (await response
		.json()
		.catch(() => null)) as PageStorageHubResponse | null;
	if (!body) {
		throw storageError("unavailable", "Page storage returned nothing");
	}
	if (!body.ok) {
		throw storageError(body.code, body.message);
	}
	return body as PageStorageHubReplyFor<Request["op"]>;
}

export async function deletePageStorage(pageId: string): Promise<void> {
	await callPageStore(pageId, { op: "clear" });
}

export async function purgePageStorageForUser(
	userId: string,
): Promise<{ pages: number; cleared: number }> {
	const memberships = await db
		.select({ organizationId: members.organizationId })
		.from(members)
		.where(eq(members.userId, userId));
	if (memberships.length === 0) return { pages: 0, cleared: 0 };

	const rows = await db
		.select({ id: pages.id })
		.from(pages)
		.where(
			inArray(
				pages.organizationId,
				memberships.map((row) => row.organizationId),
			),
		);

	let cleared = 0;
	let refused = 0;
	let lastError: unknown;
	for (let index = 0; index < rows.length; index += PURGE_CONCURRENCY) {
		const batch = rows.slice(index, index + PURGE_CONCURRENCY);
		await Promise.all(
			batch.map(async (row) => {
				try {
					const result = await callPageStore(row.id, {
						op: "clearUser",
						userId,
					});
					cleared += result.cleared;
				} catch (error) {
					refused += 1;
					lastError = error;
					console.warn("[pages] could not clear a hub during purge", {
						pageId: row.id,
						error: error instanceof Error ? error.message : error,
					});
				}
			}),
		);
	}
	if (refused > 0) {
		throw storageError(
			"unavailable",
			`Page storage kept records on ${refused} of ${rows.length} page(s): ${
				lastError instanceof Error ? lastError.message : String(lastError)
			}`,
		);
	}
	return { pages: rows.length, cleared };
}

const SUBSCRIBE_TICKET_SECONDS = 15 * 60;

export async function mintPageStoreSubscribeTicket(pageId: string): Promise<{
	url: string;
	expiresAt: number;
}> {
	const exp = Math.floor(Date.now() / 1000) + SUBSCRIBE_TICKET_SECONDS;
	const ticket = await signPageStorageTicket(env.REALTIME_NUDGE_SECRET, {
		pageId,
		exp,
	});
	const base = env.REALTIME_URL.replace(/^http/, "ws");
	return {
		url: `${base}/v2/page/${encodeURIComponent(pageId)}/storage/subscribe?token=${encodeURIComponent(ticket)}`,
		expiresAt: exp * 1000,
	};
}
