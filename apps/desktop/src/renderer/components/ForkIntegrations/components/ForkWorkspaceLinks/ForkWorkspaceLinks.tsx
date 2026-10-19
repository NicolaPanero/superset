import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useForkConnections } from "../../hooks/useForkConnections";
import { required } from "../../utils/required";
import { ForkProviderIcon } from "../ForkProviderIcon";
export function ForkWorkspaceLinks() {
	const { t } = useLingui(),
		{ workspace, hostUrl } = useWorkspace(),
		navigate = useNavigate(),
		cache = useQueryClient();
	const { client, connections, data } = useForkConnections(hostUrl);
	const [creating, setCreating] = useState(false),
		[title, setTitle] = useState(""),
		[target, setTarget] = useState("");
	const tasks = useQuery({
		refetchOnReconnect: true,
		networkMode: "always",
		retry: false,
		queryKey: ["fork-integrations", hostUrl, "links", workspace.id],
		queryFn: () =>
			required(client).forkTasks.links.query({ workspaceId: workspace.id }),
		enabled: !!data?.version,
	});
	const scm = useQuery({
		refetchOnReconnect: true,
		networkMode: "always",
		retry: false,
		queryKey: ["fork-integrations", hostUrl, "workspace-pr", workspace.id],
		queryFn: () =>
			required(client).forkScm.workspace.query({ workspaceId: workspace.id }),
		enabled:
			!!data?.version &&
			connections.some((c) => c.provider === "bitbucket" && c.enabled),
		staleTime: 30_000,
	});
	const connection =
		connections.find((c) => c.id === scm.data?.connectionId) ??
		connections.find(
			(c) => c.provider === "bitbucket" && c.enabled && c.isDefault,
		) ??
		connections.find((c) => c.provider === "bitbucket" && c.enabled);
	const create = useMutation({
		networkMode: "always",
		retry: false,
		mutationFn: async () => {
			if (!scm.data?.repository || !connection) return;
			return required(client).forkScm.createForWorkspace.mutate({
				workspaceId: workspace.id,
				connectionId: connection.id,
				repository: scm.data.repository,
				title: title || workspace.name,
				description: "",
				target: target || scm.data.defaultBranch || "",
			});
		},
		onSuccess: (result) => {
			setCreating(false);
			void cache.invalidateQueries({ queryKey: ["fork-integrations"] });
			if (result && workspace.projectId)
				void navigate({
					to: "/pull-requests",
					search: {
						forkProvider: "bitbucket",
						forkProject: workspace.projectId,
						forkNumber: result.number,
					},
				});
		},
	});
	if (!tasks.data?.length && scm.data?.repository?.provider !== "bitbucket")
		return null;
	return (
		<div className="shrink-0 space-y-2 border-b bg-background px-4 py-2">
			<div className="flex flex-wrap items-center gap-2">
				{scm.data?.repository?.provider === "bitbucket" && (
					<span className="mr-1 inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
						<ForkProviderIcon provider="bitbucket" />
						<span className="max-w-64 truncate">
							{scm.data.repository.owner}/{scm.data.repository.name}
						</span>
					</span>
				)}
				{tasks.data?.map((task) => (
					<Button
						key={task.connectionId + task.taskId}
						size="sm"
						variant="outline"
						onClick={() =>
							void navigate({
								to: "/tasks",
								search: {
									forkSource: "jira",
									forkConnection: task.connectionId,
									forkTask: task.key,
								},
							})
						}
					>
						<ForkProviderIcon provider="jira" className="size-3" />
						{task.key}
					</Button>
				))}
				{scm.data?.pullRequest && (
					<Button
						size="sm"
						variant="outline"
						onClick={() =>
							void navigate({
								to: "/pull-requests",
								search: {
									forkProvider: "bitbucket",
									forkProject: workspace.projectId ?? undefined,
									forkNumber: required(scm.data?.pullRequest).number,
								},
							})
						}
					>
						#{scm.data.pullRequest.number}
					</Button>
				)}
				{scm.data?.repository?.provider === "bitbucket" &&
					scm.data.pullRequest?.state !== "open" && (
						<Button
							size="sm"
							variant="outline"
							onClick={() => setCreating(!creating)}
						>
							<Trans>Create pull request</Trans>
						</Button>
					)}
			</div>
			{creating && (
				<form
					className="flex flex-wrap gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						create.mutate();
					}}
				>
					<Input
						className="min-w-48 flex-1"
						aria-label={t({ message: "Title" })}
						placeholder={workspace.name}
						value={title}
						onChange={(e) => setTitle(e.target.value)}
					/>
					<Input
						className="w-40"
						aria-label={t({ message: "Target branch" })}
						value={target || scm.data?.defaultBranch || ""}
						onChange={(e) => setTarget(e.target.value)}
					/>
					<Button
						size="sm"
						disabled={
							create.isPending ||
							!(target || scm.data?.defaultBranch) ||
							!connection
						}
					>
						<Trans>Push and create PR</Trans>
					</Button>
				</form>
			)}
			{creating && scm.data?.error && (
				<p role="alert" className="text-xs text-destructive">
					{scm.data.error}
				</p>
			)}
			{create.error && (
				<p role="alert" className="text-xs text-destructive">
					{create.error.message}
				</p>
			)}
		</div>
	);
}
