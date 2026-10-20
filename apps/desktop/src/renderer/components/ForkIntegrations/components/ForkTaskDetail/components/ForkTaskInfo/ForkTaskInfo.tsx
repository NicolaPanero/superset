import { Trans, useLingui } from "@lingui/react/macro";
import type { ForkTask } from "@superset/shared/fork-integrations";
import { cn } from "@superset/ui/utils";
import {
	LuArrowUp,
	LuCalendarRange,
	LuGitFork,
	LuShapes,
	LuTag,
	LuUser,
} from "react-icons/lu";
import type { PullRequestInfoVariant } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestInfo";
import { ForkInfoSection } from "../../../ForkInfoSection";
import { ForkUserAvatar } from "../../../ForkUserAvatar";

export function ForkTaskInfo({
	task,
	variant,
}: {
	task: ForkTask;
	variant: PullRequestInfoVariant;
}) {
	const { t } = useLingui();
	const none = (
		<span className="text-muted-foreground">
			<Trans>None</Trans>
		</span>
	);
	return (
		<div
			className={cn(
				variant === "column" ? "flex flex-col gap-7" : "flex flex-col",
			)}
		>
			<ForkInfoSection
				variant={variant}
				label={t({ message: "Assignee" })}
				icon={<LuUser className="size-4" />}
			>
				{task.assignee ? (
					<span className="flex min-w-0 items-center gap-1.5">
						<ForkUserAvatar
							name={task.assignee.name}
							className="size-4 text-[7px]"
						/>
						<span className="truncate">{task.assignee.name}</span>
					</span>
				) : (
					<span className="text-muted-foreground">
						<Trans>Unassigned</Trans>
					</span>
				)}
			</ForkInfoSection>
			<ForkInfoSection
				variant={variant}
				label={t({ message: "Priority" })}
				icon={<LuArrowUp className="size-4" />}
			>
				{task.priority ? <span>{task.priority}</span> : none}
			</ForkInfoSection>
			{task.type && (
				<ForkInfoSection
					variant={variant}
					label={t({ message: "Type" })}
					icon={<LuShapes className="size-4" />}
				>
					<span className="flex items-center gap-1.5">
						{task.type.iconUrl && (
							<img alt="" className="size-3.5" src={task.type.iconUrl} />
						)}
						{task.type.name}
					</span>
				</ForkInfoSection>
			)}
			{task.parent && (
				<ForkInfoSection
					variant={variant}
					label={t({ message: "Parent" })}
					icon={<LuGitFork className="size-4" />}
				>
					<span className="min-w-0 truncate" title={task.parent.title}>
						<span className="font-mono text-muted-foreground">
							{task.parent.key}
						</span>{" "}
						{task.parent.title}
					</span>
				</ForkInfoSection>
			)}
			{task.sprint && (
				<ForkInfoSection
					variant={variant}
					label={t({ message: "Sprint" })}
					icon={<LuCalendarRange className="size-4" />}
				>
					<span className="w-fit rounded bg-primary/10 px-1.5 py-0.5 text-primary">
						{task.sprint}
					</span>
				</ForkInfoSection>
			)}
			<ForkInfoSection
				variant={variant}
				label={t({ message: "Labels" })}
				icon={<LuTag className="size-4" />}
			>
				{task.labels.length ? (
					<span className="flex flex-wrap gap-1.5">
						{task.labels.map((label) => (
							<span
								key={label}
								className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground"
							>
								{label}
							</span>
						))}
					</span>
				) : (
					none
				)}
			</ForkInfoSection>
		</div>
	);
}
