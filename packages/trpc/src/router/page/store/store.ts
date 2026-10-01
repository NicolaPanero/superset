import { db } from "@superset/db/client";
import {
	pageStorageIndex,
	pages,
	type SelectPage,
	users,
} from "@superset/db/schema";
import { MAX_PAGE_STORAGE_BYTES } from "@superset/shared/page-storage";
import type { PageStorageHubRecord } from "@superset/shared/page-storage-hub";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
	callPageStore,
	mintPageStoreSubscribeTicket,
	notePageStorageWriter,
} from "../../../lib/page-store";
import { protectedProcedure } from "../../../trpc";
import { requireActiveOrgMembership } from "../../utils/active-org";
import { assertPageReadable, assertPageWritable } from "../access";
import { pageFields } from "../schema";
import {
	clearPageStorageSchema,
	readPageStorageSchema,
	writePageStorageSchema,
} from "./schema";

/**
 * The records live in the page's hub, but whether this viewer may touch them
 * is a Postgres question — visibility, author, takedown — so every procedure
 * resolves the page here first and only then calls out.
 *
 * Storage is the one place where someone who is not the page's author writes
 * to it, so readable-means-writable is deliberate: a poll only its author can
 * answer is not a poll. Everything a viewer writes stays under their own id.
 */
async function loadReadablePage(
	pageId: string,
	organizationId: string,
	userId: string,
): Promise<SelectPage> {
	const [page] = await db
		.select()
		.from(pages)
		.where(and(eq(pages.id, pageId), eq(pages.organizationId, organizationId)))
		.limit(1);

	if (!page) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
	}
	assertPageReadable(page, userId);
	if (page.takenDownAt) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "This page was taken down",
		});
	}
	return page;
}

/**
 * The hub stores opaque ids, so names are resolved here, on the way out, from
 * the one place that owns them. A viewer who has since been deleted reads as
 * "Someone" rather than breaking the tally.
 */
async function withNames(
	records: PageStorageHubRecord[],
): Promise<
	{ userId: string; name: string; value: unknown; updatedAt: string }[]
> {
	const ids = [...new Set(records.map((record) => record.userId))];
	const rows = ids.length
		? await db
				.select({ id: users.id, name: users.name })
				.from(users)
				.where(inArray(users.id, ids))
		: [];
	const names = new Map(rows.map((row) => [row.id, row.name]));

	return records.map((record) => ({
		userId: record.userId,
		name: names.get(record.userId) ?? "Someone",
		value: record.value,
		updatedAt: new Date(record.updatedAt).toISOString(),
	}));
}

export const pageStoreRouter = {
	get: protectedProcedure
		.input(readPageStorageSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			await loadReadablePage(input.pageId, organizationId, userId);

			const { record } = await callPageStore(input.pageId, {
				op: "get",
				userId,
				key: input.key,
			});
			return { value: record ? record.value : null };
		}),

	/** Every viewer's record under a key — what a tally is derived from. */
	getAll: protectedProcedure
		.input(readPageStorageSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			await loadReadablePage(input.pageId, organizationId, userId);

			const { records } = await callPageStore(input.pageId, {
				op: "getAll",
				key: input.key,
			});
			return { records: await withNames(records) };
		}),

	set: protectedProcedure
		.input(writePageStorageSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			await loadReadablePage(input.pageId, organizationId, userId);

			await callPageStore(input.pageId, {
				op: "set",
				userId,
				key: input.key,
				value: input.value ?? null,
			});
			await notePageStorageWriter(input.pageId, userId);
			return { ok: true as const };
		}),

	remove: protectedProcedure
		.input(readPageStorageSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			await loadReadablePage(input.pageId, organizationId, userId);

			await callPageStore(input.pageId, {
				op: "remove",
				userId,
				key: input.key,
			});
			return { ok: true as const };
		}),

	/**
	 * Where a window listens for changes. The stream carries no values, so a
	 * ticket is all the hub needs; the viewer still re-reads through `getAll`,
	 * which is the only thing that decides what they can see.
	 */
	subscribeUrl: protectedProcedure
		.input(z.object({ pageId: pageFields.id }))
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			await loadReadablePage(input.pageId, organizationId, userId);
			return mintPageStoreSubscribeTicket(input.pageId);
		}),

	/**
	 * Every record on the page, for the author and for the agent that
	 * published it — this is the readback half of the loop, where collected
	 * answers become something an agent can act on.
	 */
	list: protectedProcedure
		.input(z.object({ pageId: pageFields.id }))
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const page = await loadReadablePage(input.pageId, organizationId, userId);
			assertPageWritable(page, userId);

			const { records, totalBytes } = await callPageStore(input.pageId, {
				op: "list",
			});
			const named = await withNames(records);
			return {
				records: named.map((record, index) => ({
					...record,
					key: records[index]?.key ?? "",
					sizeBytes: records[index]?.sizeBytes ?? 0,
				})),
				totalBytes,
				limitBytes: MAX_PAGE_STORAGE_BYTES,
			};
		}),

	/**
	 * How much storage this organization's pages hold. Each hub knows only
	 * its own total, so this walks the index and asks them — which is the
	 * other question the index exists to make answerable. Capped, and it
	 * says when it stopped short rather than reporting a short total as the
	 * whole truth.
	 */
	usage: protectedProcedure
		.input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);

			const rows = await db
				.selectDistinct({ pageId: pageStorageIndex.pageId })
				.from(pageStorageIndex)
				.innerJoin(pages, eq(pages.id, pageStorageIndex.pageId))
				.where(eq(pages.organizationId, organizationId))
				.limit(input.limit + 1);

			const truncated = rows.length > input.limit;
			const pageIds = rows.slice(0, input.limit).map((row) => row.pageId);

			const totals = await Promise.all(
				pageIds.map(async (pageId) => {
					try {
						const { totalBytes } = await callPageStore(pageId, { op: "list" });
						return { pageId, totalBytes };
					} catch {
						return { pageId, totalBytes: 0, unreachable: true };
					}
				}),
			);

			return {
				pages: totals,
				totalBytes: totals.reduce((sum, row) => sum + row.totalBytes, 0),
				limitBytesPerPage: MAX_PAGE_STORAGE_BYTES,
				truncated,
			};
		}),

	clear: protectedProcedure
		.input(clearPageStorageSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const page = await loadReadablePage(input.pageId, organizationId, userId);
			assertPageWritable(page, userId);

			const { cleared } = await callPageStore(input.pageId, {
				op: "clear",
				...(input.key !== undefined ? { key: input.key } : {}),
			});
			// Only a full clear empties the page; clearing one key leaves the
			// index's "may have written here" claim correctly standing.
			if (input.key === undefined) {
				await db
					.delete(pageStorageIndex)
					.where(eq(pageStorageIndex.pageId, input.pageId));
			}
			return { cleared };
		}),
} satisfies TRPCRouterRecord;
