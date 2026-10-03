import { useCloudDiffStatsStore } from "renderer/stores/cloud-diff-stats";

export function CloudWorkspaceDiffStats({
	workspaceId,
}: {
	workspaceId: string;
}) {
	const stats = useCloudDiffStatsStore(
		(state) => state.byWorkspace[workspaceId],
	);
	if (!stats || (stats.additions === 0 && stats.deletions === 0)) return null;
	return (
		<span className="flex shrink-0 items-center justify-end gap-1.5 font-mono text-[10px] leading-none tabular-nums">
			<span className="text-emerald-500/90">+{stats.additions}</span>
			<span className="text-red-400/90">−{stats.deletions}</span>
		</span>
	);
}
