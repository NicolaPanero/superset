import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import {
	LuArrowUpRight,
	LuCircleCheck,
	LuCircleDashed,
	LuCircleX,
	LuLoaderCircle,
} from "react-icons/lu";

interface ForkCheck {
	id: string;
	name: string;
	state: string;
	url: string;
}

function checkTone(state: string) {
	const value = state.toLowerCase();
	if (["successful", "success", "completed"].includes(value)) return "success";
	if (["failed", "failure", "stopped", "cancelled", "error"].includes(value))
		return "failure";
	if (["inprogress", "in_progress", "queued", "pending"].includes(value))
		return "pending";
	return "neutral";
}

export function ForkPullRequestChecks({
	checks,
	loading,
}: {
	checks: ForkCheck[] | undefined;
	loading: boolean;
}) {
	if (loading)
		return (
			<p className="text-sm text-muted-foreground">
				<Trans>Loading...</Trans>
			</p>
		);
	if (!checks?.length)
		return (
			<div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
				<Trans>No checks</Trans>
			</div>
		);
	return (
		<ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-background shadow-sm">
			{checks.map((check) => {
				const tone = checkTone(check.state);
				const Icon =
					tone === "success"
						? LuCircleCheck
						: tone === "failure"
							? LuCircleX
							: tone === "pending"
								? LuLoaderCircle
								: LuCircleDashed;
				return (
					<li key={check.id}>
						<a
							className="group flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/40"
							href={check.url}
							target="_blank"
							rel="noreferrer"
						>
							<Icon
								className={cn(
									"size-4 shrink-0",
									tone === "success" &&
										"text-emerald-600 [.dark_&]:text-[#34d399]",
									tone === "failure" && "text-red-600 [.dark_&]:text-[#f87171]",
									tone === "pending" &&
										"animate-spin text-amber-500 motion-reduce:animate-none",
									tone === "neutral" && "text-muted-foreground",
								)}
							/>
							<span className="min-w-0 flex-1 truncate">{check.name}</span>
							<span className="text-xs capitalize text-muted-foreground">
								{check.state.toLowerCase().replace(/_/g, " ")}
							</span>
							<LuArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
						</a>
					</li>
				);
			})}
		</ul>
	);
}
