import { beforeEach, describe, expect, test } from "bun:test";
import { useCloudDiffStatsStore } from "./cloud-diff-stats";

const update = (workspaceId: string, additions: number, at: number) => ({
	kind: "cloud_workspaces" as const,
	workspaceId,
	diffStats: { additions, deletions: 0, at },
});

describe("useCloudDiffStatsStore", () => {
	beforeEach(() => useCloudDiffStatsStore.setState({ byWorkspace: {} }));

	test("keeps the newest counts per workspace", () => {
		const { record } = useCloudDiffStatsStore.getState();
		record([update("a", 1, 100), update("b", 2, 100)]);
		record([update("a", 5, 50)]);
		record([update("a", 7, 200)]);
		const { byWorkspace } = useCloudDiffStatsStore.getState();
		expect(byWorkspace.a?.additions).toBe(7);
		expect(byWorkspace.b?.additions).toBe(2);
	});

	test("leaves state alone for patches without diff stats", () => {
		const before = useCloudDiffStatsStore.getState().byWorkspace;
		useCloudDiffStatsStore
			.getState()
			.record([{ kind: "cloud_workspaces", workspaceId: "a", presence: [] }]);
		expect(useCloudDiffStatsStore.getState().byWorkspace).toBe(before);
	});
});
