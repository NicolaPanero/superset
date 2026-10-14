import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { LuFolderPlus, LuFolderTree, LuGitBranch } from "react-icons/lu";
import { addProjectFolders } from "renderer/lib/addProjectFolders";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getBaseName } from "renderer/lib/pathBasename/pathBasename";
import { useWorkspaceFolders } from "../../../../hooks/useWorkspaceFolders";
import { useSelectedRepoStore } from "../../../../state/selectedRepoStore";

const MAIN_REPO_VALUE = "__main__";
const ADD_FOLDER_VALUE = "__add__";

interface RepoSelectorProps {
	workspaceId: string;
}

export function RepoSelector({ workspaceId }: RepoSelectorProps) {
	const { t } = useLingui();
	const { folders, selected } = useWorkspaceFolders(workspaceId);
	const select = useSelectedRepoStore((state) => state.select);
	const utils = workspaceTrpc.useUtils();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const addFolder = workspaceTrpc.projectFolders.add.useMutation();
	const workspace = workspaceTrpc.workspace.get.useQuery({ id: workspaceId });
	const projectId = workspace.data?.projectId ?? null;
	const project = workspaceTrpc.project.get.useQuery(
		{ projectId: projectId ?? "" },
		{ enabled: projectId !== null },
	);

	if (!projectId) return null;

	const mainLabel = project.data?.repoPath
		? getBaseName(project.data.repoPath)
		: t({ message: "Main repository" });

	const pickAndAddFolder = async () => {
		try {
			const picked = await selectDirectory.mutateAsync({
				title: t({ message: "Add a folder to the project" }),
				multiple: true,
			});
			if (picked.canceled) return;
			const ids = await addProjectFolders(picked.paths, (path) =>
				addFolder.mutateAsync({ projectId, path }),
			);
			const updated = await utils.projectFolders.listForWorkspace.fetch({
				workspaceId,
			});
			const added = updated.find((folder) => folder.id === ids[0]);
			if (added) select(workspaceId, added.workspaceKey);
		} catch (error) {
			toast.error(errorMessage(error));
		}
	};

	return (
		<div className="border-b px-2 py-1.5">
			<Select
				value={selected?.workspaceKey ?? MAIN_REPO_VALUE}
				onValueChange={(value) => {
					if (value === ADD_FOLDER_VALUE) {
						void pickAndAddFolder();
						return;
					}
					select(workspaceId, value === MAIN_REPO_VALUE ? null : value);
				}}
			>
				<SelectTrigger
					size="sm"
					className="h-7 w-full gap-1.5 text-xs"
					aria-label={t({ message: "Repository" })}
				>
					<LuFolderTree className="size-3.5 shrink-0 text-muted-foreground" />
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={MAIN_REPO_VALUE}>{mainLabel}</SelectItem>
					{folders.map((folder) => (
						<SelectItem key={folder.id} value={folder.workspaceKey}>
							<span className="flex items-center gap-1.5">
								{folder.name}
								{folder.isGitRepo ? (
									<LuGitBranch className="size-3 text-muted-foreground" />
								) : null}
							</span>
						</SelectItem>
					))}
					<SelectSeparator />
					<SelectItem value={ADD_FOLDER_VALUE}>
						<span className="flex items-center gap-1.5">
							<LuFolderPlus className="size-3.5" />
							{t({ message: "Add folder…" })}
						</span>
					</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}
