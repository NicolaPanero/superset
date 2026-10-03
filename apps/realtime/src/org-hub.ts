import {
	mergePresenceByUser,
	type RealtimeDiffStats,
	type RealtimeNudgeKind,
	type RealtimeNudgeMessage,
	type RealtimeUpdate,
} from "@superset/shared/realtime";
import { type Connection, Server } from "partyserver";
import type { RealtimeEnv } from "./types";

// A burst of writes is one message: kinds accumulate for this long, then one
// broadcast carries all of them.
const COALESCE_MS = 500;
const PENDING_KEY = "pendingKinds";
const PENDING_UPDATES_KEY = "pendingUpdates";
const DIFF_STATS_KEY = "diffStats";
// Only a running box reports, so a workspace silent this long is archived or gone.
const DIFF_STATS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * One object per organization. Holds every subscribed window's socket
 * (hibernating, so idle subscribers cost nothing) and fans out invalidation
 * nudges the API sends after its writes. It stores what is waiting on the
 * next broadcast, and each workspace's latest diff stats, which live nowhere
 * else: a box reports them here and a new socket gets them on connect.
 */
export class OrgHub extends Server<RealtimeEnv> {
	static options = { hibernate: true };

	// ── RPC (called by the Worker) ────────────────────────────────────

	async nudge(kind: RealtimeNudgeKind, update?: RealtimeUpdate): Promise<void> {
		if (update?.diffStats) {
			await this.recordDiffStats(update.workspaceId, update.diffStats);
		}
		if (update) {
			const updates =
				(await this.ctx.storage.get<Record<string, RealtimeUpdate>>(
					PENDING_UPDATES_KEY,
				)) ?? {};
			const pendingUpdate = updates[update.workspaceId];
			updates[update.workspaceId] = {
				...pendingUpdate,
				...update,
				...(update.presence &&
					pendingUpdate?.presence && {
						presence: mergePresenceByUser(
							pendingUpdate.presence,
							update.presence,
							(person) => person.lastSeenAt,
						),
					}),
			};
			await this.ctx.storage.put(PENDING_UPDATES_KEY, updates);
		} else {
			const pending =
				(await this.ctx.storage.get<RealtimeNudgeKind[]>(PENDING_KEY)) ?? [];
			if (!pending.includes(kind)) {
				await this.ctx.storage.put(PENDING_KEY, [...pending, kind]);
			}
		}
		if ((await this.ctx.storage.getAlarm()) === null) {
			await this.ctx.storage.setAlarm(Date.now() + COALESCE_MS);
		}
	}

	private async recordDiffStats(
		workspaceId: string,
		stats: RealtimeDiffStats,
	): Promise<void> {
		const all =
			(await this.ctx.storage.get<Record<string, RealtimeDiffStats>>(
				DIFF_STATS_KEY,
			)) ?? {};
		if ((all[workspaceId]?.at ?? 0) > stats.at) return;
		all[workspaceId] = stats;
		const oldest = Date.now() - DIFF_STATS_MAX_AGE_MS;
		for (const [id, entry] of Object.entries(all)) {
			if (entry.at < oldest) delete all[id];
		}
		await this.ctx.storage.put(DIFF_STATS_KEY, all);
	}

	async onConnect(connection: Connection): Promise<void> {
		const all =
			(await this.ctx.storage.get<Record<string, RealtimeDiffStats>>(
				DIFF_STATS_KEY,
			)) ?? {};
		const updates: RealtimeUpdate[] = Object.entries(all).map(
			([workspaceId, diffStats]) => ({
				kind: "cloud_workspaces",
				workspaceId,
				diffStats,
			}),
		);
		if (updates.length === 0) return;
		const message: RealtimeNudgeMessage = { type: "nudge", kinds: [], updates };
		connection.send(JSON.stringify(message));
	}

	async subscriberCount(): Promise<number> {
		let count = 0;
		for (const _ of this.getConnections()) count++;
		return count;
	}

	// ── Fan-out ───────────────────────────────────────────────────────

	async onAlarm(): Promise<void> {
		const kinds =
			(await this.ctx.storage.get<RealtimeNudgeKind[]>(PENDING_KEY)) ?? [];
		const updates = Object.values(
			(await this.ctx.storage.get<Record<string, RealtimeUpdate>>(
				PENDING_UPDATES_KEY,
			)) ?? {},
		);
		await this.ctx.storage.delete([PENDING_KEY, PENDING_UPDATES_KEY]);
		if (kinds.length === 0 && updates.length === 0) return;
		const message: RealtimeNudgeMessage = { type: "nudge", kinds, updates };
		this.broadcast(JSON.stringify(message));
	}
}
