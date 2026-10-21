import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import {
	type ForkTask,
	forkTaskBranch,
} from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import { Skeleton } from "@superset/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LuGitBranch, LuPlus } from "react-icons/lu";
import { useOpenNewWorkspace } from "renderer/hooks/useOpenNewWorkspace";
import { useNewWorkspaceDraftStore } from "renderer/stores/new-workspace-draft";
import { useForkConnections } from "../../../../hooks/useForkConnections";
import { forkJiraLinkedIssue } from "../../../../utils/forkJiraWorkspace";
import { required } from "../../../../utils/required";
import { ForkTaskWorkspacePicker } from "./components/ForkTaskWorkspacePicker";
import { ForkTaskWorkspaceRow } from "./components/ForkTaskWorkspaceRow";

export function ForkTaskWorkspaces({ task }: { task: ForkTask }) {
	const { t } = useLingui();
	const { formatNumber } = useFormat();
	const { client, hostUrl } = useForkConnections();
	const cache = useQueryClient();
	const openNewWorkspace = useOpenNewWorkspace();
	const linkedWorkspaces = useQuery({
		refetchOnReconnect: true,
		networkMode: "always",
		retry: false,
		queryKey: [
			"fork-integrations",
			hostUrl,
			"task-workspaces",
			{ connectionId: task.connectionId, key: task.key },
		],
		queryFn: () =>
			required(client).forkTasks.workspaces.query({
				connectionId: task.connectionId,
				taskId: task.id,
			}),
		enabled: !!client,
	});
	const unlink = useMutation({
		networkMode: "always",
		retry: false,
		mutationFn: (workspaceId: string) =>
			required(client).forkTasks.unlink.mutate({
				workspaceId,
				connectionId: task.connectionId,
				taskId: task.id,
			}),
		onSettled: () =>
			void cache.invalidateQueries({ queryKey: ["fork-integrations"] }),
	});
	const startInWorkspace = () => {
		const drafts = useNewWorkspaceDraftStore.getState();
		drafts.resetDraft();
		drafts.updateDraft({
			linkedIssues: [forkJiraLinkedIssue(task)],
			branchName: forkTaskBranch(task.key, task.title, task.type?.name),
			branchNameEdited: true,
			branchNameFromProvider: false,
			workspaceName: `${task.key} ${task.title}`,
			workspaceNameEdited: true,
		});
		openNewWorkspace(null);
	};
	const items = linkedWorkspaces.data ?? [];
	const error = linkedWorkspaces.error ?? unlink.error;
	return (
		<section
			aria-label={t({ message: "Workspaces" })}
			className="space-y-3 border-t pt-5"
		>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
				<h3 className="flex min-w-fit flex-1 items-center gap-2 whitespace-nowrap text-sm font-medium">
					<LuGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
					<Trans>Workspaces</Trans>
					{items.length > 0 && (
						<span className="rounded bg-muted px-1.5 text-[11px] font-normal tabular-nums text-muted-foreground">
							{formatNumber(items.length)}
						</span>
					)}
				</h3>
				<div className="flex flex-wrap items-center gap-1.5">
					<Button size="xs" onClick={startInWorkspace} disabled={!client}>
						<LuPlus className="size-3.5" />
						<Trans>Start in workspace</Trans>
					</Button>
					<ForkTaskWorkspacePicker
						task={task}
						linkedWorkspaceIds={items.map((workspace) => workspace.id)}
						disabled={!linkedWorkspaces.isSuccess || unlink.isPending}
					/>
				</div>
			</div>
			{linkedWorkspaces.isSuccess && items.length === 0 && (
				<p className="text-xs text-muted-foreground">
					<Trans>No workspaces linked to this task.</Trans>
				</p>
			)}
			{linkedWorkspaces.isPending && (
				<Skeleton className="h-8 w-full rounded-md" />
			)}
			{items.length > 0 && (
				<ul className="divide-y rounded-lg border bg-muted/10">
					{items.map((workspace) => (
						<ForkTaskWorkspaceRow
							key={workspace.id}
							workspace={workspace}
							unlinking={unlink.isPending}
							onUnlink={() => unlink.mutate(workspace.id)}
						/>
					))}
				</ul>
			)}
			{error && (
				<div className="flex items-center gap-2">
					<p role="alert" className="min-w-0 text-xs text-destructive">
						{error.message}
					</p>
					{linkedWorkspaces.isError && (
						<Button
							size="xs"
							variant="ghost"
							onClick={() => void linkedWorkspaces.refetch()}
						>
							<Trans>Try again</Trans>
						</Button>
					)}
				</div>
			)}
		</section>
	);
}
