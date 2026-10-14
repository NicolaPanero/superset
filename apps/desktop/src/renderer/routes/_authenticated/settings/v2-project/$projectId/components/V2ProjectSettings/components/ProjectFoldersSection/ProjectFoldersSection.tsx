import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LuFolderPlus, LuGitBranch, LuX } from "react-icons/lu";
import { addProjectFolders } from "renderer/lib/addProjectFolders";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { ClickablePath } from "../../../../../../components/ClickablePath";

interface ProjectFoldersSectionProps {
	projectId: string;
	hostUrl: string;
}

export function ProjectFoldersSection({
	projectId,
	hostUrl,
}: ProjectFoldersSectionProps) {
	const { t } = useLingui();
	const queryClient = useQueryClient();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const queryKey = ["project-folders", hostUrl, projectId];
	const client = getHostServiceClientByUrl(hostUrl);

	const { data: folders = [] } = useQuery({
		queryKey,
		queryFn: () => client.projectFolders.list.query({ projectId }),
	});

	const refresh = () => {
		void queryClient.invalidateQueries({ queryKey });
		void queryClient.invalidateQueries({ queryKey: ["project-folders"] });
	};

	const add = useMutation({
		mutationFn: (paths: string[]) =>
			addProjectFolders(paths, (path) =>
				client.projectFolders.add.mutate({ projectId, path }),
			),
		onSettled: refresh,
	});
	const setIsolate = useMutation({
		mutationFn: (input: { id: string; isolateInWorktrees: boolean }) =>
			client.projectFolders.setIsolate.mutate(input),
		onSuccess: refresh,
		onError: (err) => toast.error(errorMessage(err)),
	});
	const remove = useMutation({
		mutationFn: (id: string) => client.projectFolders.remove.mutate({ id }),
		onSuccess: refresh,
		onError: (err) => toast.error(errorMessage(err)),
	});

	const pickFolder = async () => {
		try {
			const picked = await selectDirectory.mutateAsync({
				title: t({ message: "Add a folder to the project" }),
				multiple: true,
			});
			if (picked.canceled) return;
			add.mutate(picked.paths);
		} catch (err) {
			toast.error(errorMessage(err));
		}
	};

	return (
		<div className="space-y-3">
			{folders.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					<Trans>No extra folders.</Trans>
				</p>
			) : (
				<ul className="space-y-1.5">
					{folders.map((folder) => (
						<li
							key={folder.id}
							className="flex items-center gap-2 rounded-md border px-3 py-1.5"
						>
							{folder.isGitRepo ? (
								<LuGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
							) : null}
							<div className="min-w-0 flex-1">
								<div className="truncate text-sm">{folder.name}</div>
								<ClickablePath path={folder.path} />
								{folder.exists ? null : (
									<div className="text-xs text-destructive">
										<Trans>This folder no longer exists on disk.</Trans>
									</div>
								)}
							</div>
							{folder.isGitRepo ? (
								<div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
									<Trans>Worktree per workspace</Trans>
									<Switch
										aria-label={t({ message: "Worktree per workspace" })}
										checked={folder.isolateInWorktrees}
										disabled={setIsolate.isPending}
										onCheckedChange={(isolateInWorktrees) =>
											setIsolate.mutate({ id: folder.id, isolateInWorktrees })
										}
									/>
								</div>
							) : null}
							<Button
								variant="ghost"
								size="icon"
								className="size-7"
								aria-label={t({ message: "Remove folder" })}
								disabled={remove.isPending}
								onClick={() => remove.mutate(folder.id)}
							>
								<LuX className="size-3.5" />
							</Button>
						</li>
					))}
				</ul>
			)}
			<Button
				variant="outline"
				size="sm"
				disabled={add.isPending || selectDirectory.isPending}
				onClick={() => void pickFolder()}
			>
				<LuFolderPlus className="size-3.5" />
				<Trans>Add folder</Trans>
			</Button>
		</div>
	);
}
