import { db } from "@superset/db/client";
import { pageStorageIndex } from "@superset/db/schema";
import {
	type PageStorageHubReplyFor,
	type PageStorageHubRequest,
	type PageStorageHubResponse,
	pageStorageOpPath,
} from "@superset/shared/page-storage-hub";
import { signPageStorageTicket } from "@superset/shared/usercontent";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { env } from "../env";

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
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Page storage is unreachable: ${
				error instanceof Error ? error.message : String(error)
			}`,
		});
	}

	if (!response.ok) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Page storage refused the call (${response.status})`,
		});
	}

	const body = (await response
		.json()
		.catch(() => null)) as PageStorageHubResponse | null;
	if (!body) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Page storage returned nothing",
		});
	}
	if (!body.ok) {
		throw new TRPCError({ code: "FORBIDDEN", message: body.message });
	}
	return body as PageStorageHubReplyFor<Request["op"]>;
}

export async function notePageStorageWriter(
	pageId: string,
	userId: string,
): Promise<void> {
	try {
		await db
			.insert(pageStorageIndex)
			.values({ pageId, userId })
			.onConflictDoUpdate({
				target: [pageStorageIndex.pageId, pageStorageIndex.userId],
				set: { updatedAt: new Date() },
			});
	} catch (error) {
		console.warn("[pages] storage index write failed", { pageId, error });
	}
}

export async function deletePageStorage(pageId: string): Promise<void> {
	await callPageStore(pageId, { op: "clear" });
	await db.delete(pageStorageIndex).where(eq(pageStorageIndex.pageId, pageId));
}

export async function purgePageStorageForUser(
	userId: string,
): Promise<{ pages: number; cleared: number }> {
	const rows = await db
		.select({ pageId: pageStorageIndex.pageId })
		.from(pageStorageIndex)
		.where(eq(pageStorageIndex.userId, userId));

	let cleared = 0;
	for (const row of rows) {
		const result = await callPageStore(row.pageId, {
			op: "clearUser",
			userId,
		});
		cleared += result.cleared;
	}

	await db.delete(pageStorageIndex).where(eq(pageStorageIndex.userId, userId));

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
