import { useLingui } from "@lingui/react/macro";
import type { ForkPullRequest } from "@superset/shared/fork-integrations";
import { LuArrowRight, LuArrowUpRight } from "react-icons/lu";
import { PullRequestStatePill } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestStatePill";
import { ForkRelativeTime } from "../../../ForkRelativeTime";
import { ForkUserAvatar } from "../../../ForkUserAvatar";

export function ForkPullRequestHeader({
	pr,
	pendingLabel,
}: {
	pr: ForkPullRequest;
	pendingLabel?: string | null;
}) {
	const { t } = useLingui();
	return (
		<header className="shrink-0 pb-4">
			<div className="flex min-w-0 items-center gap-2">
				<PullRequestStatePill
					data={{ state: pr.state, isDraft: pr.isDraft ?? false }}
					pendingLabel={pendingLabel}
				/>
				<a
					href={pr.url}
					target="_blank"
					rel="noreferrer"
					className="group flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
					title={t({ message: "View on Bitbucket" })}
				>
					<span className="truncate">
						{pr.repository.name} #{pr.number}
					</span>
					<LuArrowUpRight className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
				</a>
			</div>
			<h1 className="mt-3 select-text break-words text-[1.75rem] font-semibold leading-tight tracking-tight @max-[48rem]/detail:text-2xl @max-[36rem]/detail:mt-2 @max-[36rem]/detail:text-xl">
				{pr.title}
			</h1>
			<div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
				<span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
					<ForkUserAvatar name={pr.author} className="size-4 text-[7px]" />
					<span className="truncate">{pr.author}</span>
				</span>
				{pr.updatedAt && (
					<>
						<span aria-hidden>·</span>
						<ForkRelativeTime value={pr.updatedAt} />
					</>
				)}
				<span aria-hidden>·</span>
				<span
					className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground/80"
					title={t({
						message: `${pr.sourceBranch} into ${pr.targetBranch}`,
					})}
				>
					<span className="min-w-0 truncate rounded bg-muted/60 px-1.5 py-0.5">
						{pr.sourceBranch}
					</span>
					<LuArrowRight aria-hidden className="size-3.5 shrink-0" />
					<span className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5">
						{pr.targetBranch}
					</span>
				</span>
			</div>
		</header>
	);
}
