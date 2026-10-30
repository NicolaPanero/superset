import { LuGitBranch } from "react-icons/lu";

interface RepoOptionLabelProps {
	name: string;
	isGitRepo: boolean;
	branch: string | null;
}

export function RepoOptionLabel({
	name,
	isGitRepo,
	branch,
}: RepoOptionLabelProps) {
	return (
		<span className="flex w-full min-w-0 items-center gap-2">
			<span className="min-w-0 truncate" title={name}>
				{name}
			</span>
			{branch ? (
				<span
					className="inline-flex min-w-0 items-center gap-1 rounded-md bg-muted px-1.5 py-px font-mono text-[10px] text-muted-foreground"
					title={branch}
				>
					<LuGitBranch className="size-3 shrink-0" />
					<span className="truncate">{branch}</span>
				</span>
			) : isGitRepo ? (
				<LuGitBranch className="size-3 shrink-0 text-muted-foreground" />
			) : null}
		</span>
	);
}
