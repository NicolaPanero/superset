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

	subscribeUrl: protectedProcedure
		.input(z.object({ pageId: pageFields.id }))
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			await loadReadablePage(input.pageId, organizationId, userId);
			return mintPageStoreSubscribeTicket(input.pageId);
		}),

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
			if (input.key === undefined) {
				await db
					.delete(pageStorageIndex)
					.where(eq(pageStorageIndex.pageId, input.pageId));
			}
			return { cleared };
		}),
} satisfies TRPCRouterRecord;
