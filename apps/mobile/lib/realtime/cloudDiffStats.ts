import type {
	RealtimeDiffStats,
	RealtimeUpdate,
} from "@superset/shared/realtime";
import { create } from "zustand";

interface CloudDiffStatsState {
	byWorkspace: Record<string, RealtimeDiffStats>;
	record: (updates: readonly RealtimeUpdate[]) => void;
}

/** Fed only by realtime: the API never returns diff stats. */
export const useCloudDiffStatsStore = create<CloudDiffStatsState>()((set) => ({
	byWorkspace: {},
	record: (updates) =>
		set((state) => {
			let next: Record<string, RealtimeDiffStats> | null = null;
			for (const { workspaceId, diffStats } of updates) {
				if (!diffStats) continue;
				const current = (next ?? state.byWorkspace)[workspaceId];
				if (current && current.at > diffStats.at) continue;
				next ??= { ...state.byWorkspace };
				next[workspaceId] = diffStats;
			}
			return next ? { byWorkspace: next } : state;
		}),
}));
