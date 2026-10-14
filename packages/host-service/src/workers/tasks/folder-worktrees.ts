import { createUserSimpleGit } from "../../runtime/git/simple-git.ts";
import { defineWorkerTask } from "../define-worker-task.ts";

export const gitAddFolderWorktreeTask = defineWorkerTask<
	{
		repoPath: string;
		worktreePath: string;
		branch: string;
		gitEnv: Record<string, string>;
	},
	{ created: true }
>({
	type: "git/addFolderWorktree",
	handler: async ({ repoPath, worktreePath, branch, gitEnv }) => {
		const git = createUserSimpleGit(repoPath, { env: gitEnv });
		const branchExists = (await git.raw(["branch", "--list", branch])).trim();
		await git.raw(
			branchExists
				? ["worktree", "add", worktreePath, branch]
				: ["worktree", "add", "--no-track", "-b", branch, worktreePath],
		);
		return { created: true };
	},
});

export const folderWorktreeTasks = [gitAddFolderWorktreeTask];
