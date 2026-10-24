import { Trans, useLingui } from "@lingui/react/macro";
import type { ForkPullRequest } from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import {
	LuArrowUpRight,
	LuCheck,
	LuChevronDown,
	LuCircleX,
	LuEllipsis,
	LuGitMerge,
	LuGitPullRequestClosed,
	LuPencil,
	LuRotateCcw,
	LuUndo2,
} from "react-icons/lu";

export type ForkPullRequestAction =
	| "merge"
	| "close"
	| "reopen"
	| "approve"
	| "unapprove"
	| "request-changes"
	| "unrequest-changes"
	| "set-draft";

export function ForkPullRequestActions({
	pr,
	busy,
	merging,
	mergeMethods,
	method,
	onMethodChange,
	onAction,
	onEdit,
	canSetDraft = false,
}: {
	pr: ForkPullRequest;
	busy: boolean;
	merging: boolean;
	mergeMethods: { id: string; label: string }[];
	method: string;
	onMethodChange: (method: string) => void;
	onAction: (action: ForkPullRequestAction) => void;
	onEdit: () => void;
	canSetDraft?: boolean;
}) {
	const { t } = useLingui();
	const [mergeOpen, setMergeOpen] = useState(false);
	const open = pr.state === "open";
	const bitbucket = pr.repository.provider === "bitbucket";
	return (
		<div className="flex shrink-0 items-center gap-1.5">
			{open && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button size="xs" variant="outline" disabled={busy}>
							<Trans>Review</Trans>
							<LuChevronDown className="size-3.5" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56">
						<DropdownMenuItem onSelect={() => onAction("approve")}>
							<LuCheck />
							<Trans>Approve</Trans>
						</DropdownMenuItem>
						{bitbucket && (
							<DropdownMenuItem onSelect={() => onAction("request-changes")}>
								<LuCircleX />
								<Trans>Request changes</Trans>
							</DropdownMenuItem>
						)}
						<DropdownMenuSeparator />
						<DropdownMenuItem onSelect={() => onAction("unapprove")}>
							<LuUndo2 />
							<Trans>Remove approval</Trans>
						</DropdownMenuItem>
						{bitbucket && (
							<DropdownMenuItem onSelect={() => onAction("unrequest-changes")}>
								<LuUndo2 />
								<Trans>Withdraw change request</Trans>
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
			{open && !pr.isDraft && (
				<Popover open={mergeOpen} onOpenChange={setMergeOpen}>
					<PopoverTrigger asChild>
						<Button
							size="xs"
							disabled={busy}
							className="bg-emerald-600 text-white hover:bg-emerald-600/90"
						>
							<LuGitMerge className="size-3.5" />
							{merging ? <Trans>Merging…</Trans> : <Trans>Merge</Trans>}
						</Button>
					</PopoverTrigger>
					<PopoverContent align="end" className="w-72 space-y-3 p-3">
						<p className="text-sm font-medium">
							<Trans>Merge pull request</Trans>
						</p>
						<p className="break-all font-mono text-[11px] text-muted-foreground">
							{pr.sourceBranch} → {pr.targetBranch}
						</p>
						{mergeMethods.length > 1 && (
							<select
								aria-label={t({ message: "Merge method" })}
								className="h-8 w-full rounded-md border bg-background px-2 text-sm"
								value={method}
								onChange={(e) => onMethodChange(e.target.value)}
							>
								{mergeMethods.map((option) => (
									<option key={option.id} value={option.id}>
										{option.label}
									</option>
								))}
							</select>
						)}
						<div className="flex justify-end gap-2">
							<Button
								size="sm"
								variant="ghost"
								onClick={() => setMergeOpen(false)}
							>
								<Trans>Cancel</Trans>
							</Button>
							<Button
								size="sm"
								disabled={busy}
								className="bg-emerald-600 text-white hover:bg-emerald-600/90"
								onClick={() => {
									setMergeOpen(false);
									onAction("merge");
								}}
							>
								<Trans>Confirm merge</Trans>
							</Button>
						</div>
					</PopoverContent>
				</Popover>
			)}
			{open && pr.isDraft && canSetDraft && (
				<Button size="xs" disabled={busy} onClick={() => onAction("set-draft")}>
					<Trans>Ready for review</Trans>
				</Button>
			)}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						size="icon-xs"
						variant="ghost"
						aria-label={t({ message: "More actions" })}
					>
						<LuEllipsis className="size-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-52">
					{open && !pr.isDraft && canSetDraft && (
						<DropdownMenuItem onSelect={() => onAction("set-draft")}>
							<LuPencil />
							<Trans>Draft</Trans>
						</DropdownMenuItem>
					)}
					<DropdownMenuItem onSelect={onEdit}>
						<LuPencil />
						<Trans>Edit</Trans>
					</DropdownMenuItem>
					<DropdownMenuItem asChild>
						<a href={pr.url} target="_blank" rel="noreferrer">
							<LuArrowUpRight />
							<Trans>View on Bitbucket</Trans>
						</a>
					</DropdownMenuItem>
					{open && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								variant="destructive"
								disabled={busy}
								onSelect={() => onAction("close")}
							>
								<LuGitPullRequestClosed />
								<Trans>Close pull request</Trans>
							</DropdownMenuItem>
						</>
					)}
					{/* Bitbucket Cloud cannot reopen a declined pull request. */}
					{pr.state === "closed" && !bitbucket && (
						<DropdownMenuItem
							disabled={busy}
							onSelect={() => onAction("reopen")}
						>
							<LuRotateCcw />
							<Trans>Reopen</Trans>
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
