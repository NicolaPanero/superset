import { LeaderboardCard } from "../LeaderboardCard";
import { UsageHistorySection } from "../UsageHistorySection";

export function UsageView({ hostUrl }: { hostUrl: string | null }) {
	return (
		<div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-4 px-6 py-4">
			<LeaderboardCard hostUrl={hostUrl} />
			<UsageHistorySection hostUrl={hostUrl} />
		</div>
	);
}
