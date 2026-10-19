import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { LuCheck, LuGitBranch } from "react-icons/lu";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";

export function ForkDraftChatIntro({
	hasPendingPrompt,
	className,
}: {
	hasPendingPrompt: boolean;
	className?: string;
}) {
	const { workspace } = useWorkspace();
	return (
		<div className={cn("flex flex-col justify-end px-6 pb-3", className)}>
			{hasPendingPrompt && (
				<div className="mx-auto flex max-w-full items-center gap-2 rounded-xl border bg-card/80 px-3 py-2 text-xs text-muted-foreground">
					<LuCheck className="size-3.5 shrink-0 text-success" />
					<span className="shrink-0 font-medium text-foreground">
						{workspace.type === "session" ? (
							<Trans>Chat session ready</Trans>
						) : (
							<Trans>Workspace ready</Trans>
						)}
					</span>
					{workspace.type !== "session" && workspace.branch && (
						<>
							<span aria-hidden="true">·</span>
							<LuGitBranch className="size-3 shrink-0" />
							<code className="truncate text-foreground">
								{workspace.branch}
							</code>
							<span aria-hidden="true">·</span>
							<span className="shrink-0">
								{workspace.type === "worktree" ? (
									<Trans>worktree</Trans>
								) : (
									<Trans>current checkout</Trans>
								)}
							</span>
						</>
					)}
				</div>
			)}
		</div>
	);
}
