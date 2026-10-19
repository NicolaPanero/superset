import { Trans } from "@lingui/react/macro";
import type { ForkReviewer } from "@superset/shared/fork-integrations";
import { cn } from "@superset/ui/utils";
import { LuCheck, LuCircleDashed, LuCircleX } from "react-icons/lu";

export function ForkPullRequestReviewers({
	reviewers,
}: {
	reviewers: ForkReviewer[];
}) {
	if (!reviewers.length) return null;
	return (
		<div className="flex flex-wrap items-center gap-2 text-xs">
			<span className="text-muted-foreground">
				<Trans>Reviewers</Trans>
			</span>
			{reviewers.map((reviewer) => {
				const Icon =
					reviewer.state === "approved"
						? LuCheck
						: reviewer.state === "changes_requested"
							? LuCircleX
							: LuCircleDashed;
				return (
					<span
						key={reviewer.name}
						className={cn(
							"inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5",
							reviewer.state === "approved" &&
								"border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
							reviewer.state === "changes_requested" &&
								"border-amber-500/30 text-amber-600 dark:text-amber-400",
						)}
					>
						{reviewer.avatarUrl ? (
							<img
								alt=""
								className="size-4 rounded-full"
								src={reviewer.avatarUrl}
							/>
						) : null}
						{reviewer.name}
						<Icon className="size-3" />
					</span>
				);
			})}
		</div>
	);
}
