import {
	useWorkspaceGitStatus,
	WorkspaceGitStatusProvider,
} from "../../../../providers/WorkspaceGitStatusProvider";
import { FilesTab } from "../FilesTab";

interface FolderFilesProps {
	repoKey: string;
	isGitRepo: boolean;
	onSelectFile: (absolutePath: string, openInNewTab?: boolean) => void;
	selectedFilePath?: string;
	pendingReveal?: { path: string; isDirectory: boolean } | null;
	onSearch?: () => void;
}

function GitFolderFiles(props: Omit<FolderFilesProps, "isGitRepo">) {
	const gitStatus = useWorkspaceGitStatus();
	return (
		<FilesTab
			workspaceId={props.repoKey}
			gitStatus={gitStatus.data}
			onSelectFile={props.onSelectFile}
			selectedFilePath={props.selectedFilePath}
			pendingReveal={props.pendingReveal}
			onSearch={props.onSearch}
		/>
	);
}

/** The Files tab body for an extra project folder. */
export function FolderFiles({ isGitRepo, ...props }: FolderFilesProps) {
	if (!isGitRepo) {
		return (
			<FilesTab
				workspaceId={props.repoKey}
				gitStatus={undefined}
				onSelectFile={props.onSelectFile}
				selectedFilePath={props.selectedFilePath}
				pendingReveal={props.pendingReveal}
				onSearch={props.onSearch}
			/>
		);
	}
	return (
		<WorkspaceGitStatusProvider workspaceId={props.repoKey}>
			<GitFolderFiles {...props} />
		</WorkspaceGitStatusProvider>
	);
}
