import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { LuCheck, LuCopy, LuMaximize2 } from "react-icons/lu";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { forkPullRequestUrl } from "renderer/lib/fork-pull-request-ref";
import { usePullRequestsSplitViewStore } from "renderer/routes/_authenticated/_dashboard/pull-requests/stores/pullRequestsSplitViewStore";
import { PullRequestPaneHeaderExtras } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/PullRequestPane/components/PullRequestPaneHeaderExtras/PullRequestPaneHeaderExtras";
import type { PullRequestPaneData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useForkPullRequestPaneTarget } from "./useForkPullRequestPaneTarget";

export function ForkWorkspacePullRequestHeader({
	data,
}: {
	data: PullRequestPaneData;
}) {
	const { t } = useLingui();
	const { projectId } = useForkPullRequestPaneTarget(data);
	const navigate = useNavigate();
	const { copyToClipboard, copied } = useCopyToClipboard();
	const url = forkPullRequestUrl(data);
	if (!url) return <PullRequestPaneHeaderExtras data={data} />;
	const copyLabel = copied
		? t({ message: "Copied" })
		: t({ message: "Copy link to pull request" });
	const openLabel = t({ message: "Open in Pull Requests" });
	return (
		<>
			<button
				type="button"
				aria-label={copyLabel}
				title={copyLabel}
				className="rounded p-1 text-muted-foreground/60 hover:text-muted-foreground"
				onClick={() =>
					void copyToClipboard(url).catch(() =>
						toast.error(t({ message: "Failed to copy to clipboard" })),
					)
				}
			>
				{copied ? (
					<LuCheck className="size-3.5" />
				) : (
					<LuCopy className="size-3.5" />
				)}
			</button>
			<button
				type="button"
				aria-label={openLabel}
				disabled={!projectId}
				title={openLabel}
				className="rounded p-1 text-muted-foreground/60 hover:text-muted-foreground"
				onClick={() => {
					usePullRequestsSplitViewStore.getState().expandDetail();
					void navigate({
						to: "/pull-requests/$prNumber",
						params: { prNumber: String(data.number) },
						search: {
							forkProvider: "bitbucket",
							project: projectId ?? undefined,
						},
					});
				}}
			>
				<LuMaximize2 className="size-3.5" />
			</button>
		</>
	);
}
