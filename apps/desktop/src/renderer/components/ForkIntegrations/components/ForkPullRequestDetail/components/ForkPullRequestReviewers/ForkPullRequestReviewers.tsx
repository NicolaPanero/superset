import { Trans, useLingui } from "@lingui/react/macro";
import type { ForkReviewer } from "@superset/shared/fork-integrations";
import { cn } from "@superset/ui/utils";
import { LuCheck, LuCircleDashed, LuCircleX, LuUsers } from "react-icons/lu";
import type { PullRequestInfoVariant } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestInfo";
import { ForkInfoSection } from "../../../ForkInfoSection";
import { ForkUserAvatar } from "../../../ForkUserAvatar";

export function ForkPullRequestReviewers({
	reviewers,
	variant,
}: {
	reviewers: ForkReviewer[];
	variant: PullRequestInfoVariant;
}) {
	const { t } = useLingui();
	return (
		<ForkInfoSection
			variant={variant}
			label={t({ message: "Reviewers" })}
			icon={<LuUsers className="size-4" />}
		>
			{reviewers.length ? (
				reviewers.map((reviewer) => {
					const Icon =
						reviewer.state === "approved"
							? LuCheck
							: reviewer.state === "changes_requested"
								? LuCircleX
								: LuCircleDashed;
					return (
						<span
							key={reviewer.name}
							className="flex min-w-0 items-center gap-1.5"
						>
							<ForkUserAvatar
								name={reviewer.name}
								src={reviewer.avatarUrl}
								className="size-4 text-[7px]"
							/>
							<span className="truncate">{reviewer.name}</span>
							<Icon
								aria-label={
									reviewer.state === "approved"
										? t({ message: "Approved" })
										: reviewer.state === "changes_requested"
											? t({ message: "Changes requested" })
											: t({ message: "Review pending" })
								}
								className={cn(
									"size-3.5 shrink-0",
									reviewer.state === "approved" &&
										"text-emerald-600 [.dark_&]:text-[#34d399]",
									reviewer.state === "changes_requested" &&
										"text-amber-600 [.dark_&]:text-[#fbbf24]",
									reviewer.state === "pending" && "text-muted-foreground",
								)}
							/>
						</span>
					);
				})
			) : (
				<span className="text-muted-foreground">
					<Trans>No reviewers</Trans>
				</span>
			)}
		</ForkInfoSection>
	);
}
