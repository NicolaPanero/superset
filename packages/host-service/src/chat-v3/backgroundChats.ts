import { and, desc, eq, notInArray } from "drizzle-orm";
import type { HostDb } from "../db";
import { backgroundChats } from "../db/fork-schema";

export type BackgroundChat = typeof backgroundChats.$inferSelect;

export const BACKGROUND_CHAT_LIMIT = 20;

/** Records a closed chat pane. Returns the oldest chats past the limit, now forgotten. */
export function parkChat(
	db: HostDb,
	chat: Omit<BackgroundChat, "parkedAt">,
	now = Date.now(),
	limit = BACKGROUND_CHAT_LIMIT,
): BackgroundChat[] {
	db.insert(backgroundChats)
		.values({ ...chat, parkedAt: now })
		.onConflictDoUpdate({
			target: backgroundChats.terminalId,
			set: {
				workspaceId: chat.workspaceId,
				title: chat.title,
				paneData: chat.paneData,
				parkedAt: now,
			},
		})
		.run();
	const kept = listParkedChats(db, chat.workspaceId).slice(0, limit);
	const evicted = db
		.select()
		.from(backgroundChats)
		.where(
			and(
				eq(backgroundChats.workspaceId, chat.workspaceId),
				notInArray(
					backgroundChats.terminalId,
					kept.map((row) => row.terminalId),
				),
			),
		)
		.all();
	for (const row of evicted) unparkChat(db, row.terminalId);
	return evicted;
}

export function listParkedChats(
	db: HostDb,
	workspaceId: string,
): BackgroundChat[] {
	return db
		.select()
		.from(backgroundChats)
		.where(eq(backgroundChats.workspaceId, workspaceId))
		.orderBy(desc(backgroundChats.parkedAt))
		.all();
}

export function unparkChat(db: HostDb, terminalId: string): void {
	db.delete(backgroundChats)
		.where(eq(backgroundChats.terminalId, terminalId))
		.run();
}
