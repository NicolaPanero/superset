import { Text } from "@/components/ui/text";
import { useCloudDiffStatsStore } from "@/lib/realtime";

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
		<Text className="text-muted-foreground font-mono text-xs">
			+{stats.additions} −{stats.deletions}
		</Text>
	);
}
