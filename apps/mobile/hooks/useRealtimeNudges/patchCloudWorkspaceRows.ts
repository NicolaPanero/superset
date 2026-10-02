import {
	mergePresenceByUser,
	type RealtimeUpdate,
} from "@superset/shared/realtime";
import type { CloudWorkspaceRow } from "../useCloudWorkspaces";

const lastSeenAtMs = (person: { lastSeenAt: Date | string }) =>
	new Date(person.lastSeenAt).getTime();

export function patchCloudWorkspaceRows(
	rows: CloudWorkspaceRow[],
	updates: readonly RealtimeUpdate[],
): CloudWorkspaceRow[] {
	return rows.map((row) => {
		const update = updates.find((u) => u.workspaceId === row.id);
		if (!update) return row;
		return {
			...row,
			...(update.agentStatusAt !== undefined && {
				agentStatus: update.agentStatus ?? null,
				agentStatusAt: new Date(update.agentStatusAt),
			}),
			...(update.presence && {
				presence: mergePresenceByUser(
					row.presence,
					update.presence.map((person) => ({
						...person,
						lastSeenAt: new Date(person.lastSeenAt),
					})),
					lastSeenAtMs,
				),
			}),
		};
	});
}
