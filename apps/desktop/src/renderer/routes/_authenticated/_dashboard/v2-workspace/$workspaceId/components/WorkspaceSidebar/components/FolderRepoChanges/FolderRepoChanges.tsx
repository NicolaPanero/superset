import { WorkspaceGitStatusProvider } from "../../../../providers/WorkspaceGitStatusProvider";
import {
	type SelectedDiffTarget,
	useChangesTab,
} from "../../hooks/useChangesTab";

interface FolderRepoChangesProps {
	repoKey: string;
	selectedDiffTarget?: SelectedDiffTarget;
	onSelectDiffFile?: (
		path: string,
		openInNewTab?: boolean,
		line?: number,
		side?: undefined,
		changeKey?: string,
		repoKey?: string,
	) => void;
	onSelectFile: (absolutePath: string, openInNewTab?: boolean) => void;
}

function FolderRepoChangesContent({
	repoKey,
	selectedDiffTarget,
	onSelectDiffFile,
	onSelectFile,
}: FolderRepoChangesProps) {
	const tab = useChangesTab({
		workspaceId: repoKey,
		selectedDiffTarget,
		onSelectFile: onSelectDiffFile
			? (path, openInNewTab, changeKey) =>
					onSelectDiffFile(
						path,
						openInNewTab,
						undefined,
						undefined,
						changeKey,
						repoKey,
					)
			: undefined,
		onOpenFile: onSelectFile,
	});
	return tab.content;
}

/** The Changes tab body for an extra project folder that is a git repository. */
export function FolderRepoChanges(props: FolderRepoChangesProps) {
	return (
		<WorkspaceGitStatusProvider workspaceId={props.repoKey}>
			<FolderRepoChangesContent {...props} />
		</WorkspaceGitStatusProvider>
	);
}
