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

/**
 * Calls a page's storage hub. Unlike a nudge this is awaited: the records
 * live in the hub, so a failed call is a failed read or write and the caller
 * has to hear about it rather than lose a vote quietly.
 */
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
		// The hub counts bytes, so a quota refusal comes from there; the code
		// travels in the message the page branches on.
		throw new TRPCError({ code: "FORBIDDEN", message: body.message });
	}
	return body as PageStorageHubReplyFor<Request["op"]>;
}

/**
 * Notes that this person has written on this page, so an account purge can
 * find the hub later. Best effort: the index is a hint, and losing a write to
 * it costs a purge some completeness, never the viewer their vote. Failing the
 * write itself over a bookkeeping row would be the worse trade.
 */
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

/**
 * Wipes a page's hub and forgets where it was. Called when the page is
 * deleted. The records are already unreachable at that point — every read
 * goes through the API, which can no longer resolve the page — so this is
 * hygiene rather than containment, and it is safe to re-run.
 */
export async function deletePageStorage(pageId: string): Promise<void> {
	await callPageStore(pageId, { op: "clear" });
	await db.delete(pageStorageIndex).where(eq(pageStorageIndex.pageId, pageId));
}

/**
 * Removes everything one person wrote across every page. The index is what
 * makes this answerable at all: a hub knows only itself, so without it their
 * records would sit in however many hubs with nothing naming them.
 */
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

/** How long a subscribe ticket stays good. Short, because it is cheap to mint. */
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
