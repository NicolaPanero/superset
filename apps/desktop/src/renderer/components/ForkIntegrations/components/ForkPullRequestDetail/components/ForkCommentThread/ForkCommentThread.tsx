import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	LuCheck,
	LuChevronDown,
	LuChevronRight,
	LuFileCode,
	LuReply,
	LuRotateCcw,
} from "react-icons/lu";
import { CommentBody } from "renderer/components/CommentBody";
import { ForkCommentComposer } from "../../../ForkCommentComposer";
import { ForkRelativeTime } from "../../../ForkRelativeTime";
import { ForkUserAvatar } from "../../../ForkUserAvatar";
import type { ForkReviewThread } from "../../utils/forkReviewThreads";

export function ForkCommentThread({
	thread,
	busy,
	canReply,
	onReply,
	onResolve,
	showLocation = true,
}: {
	thread: ForkReviewThread;
	busy: boolean;
	canReply: boolean;
	onReply: (commentId: string, body: string) => Promise<unknown>;
	onResolve: (commentId: string, resolved: boolean) => void;
	showLocation?: boolean;
}) {
	const { t } = useLingui();
	const [open, setOpen] = useState(!thread.root.resolved);
	const [replying, setReplying] = useState(false);
	const { root } = thread;
	const location = showLocation && root.path;
	return (
		<article
			className={cn(
				"overflow-hidden rounded-xl border border-border/60 bg-background text-sm shadow-sm",
				root.resolved && "bg-muted/20",
			)}
		>
			{(location || root.resolved) && (
				<header className="flex min-w-0 items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
					{location && (
						<span className="flex min-w-0 items-center gap-1.5 font-mono">
							<LuFileCode className="size-3.5 shrink-0" />
							<span className="truncate">
								{root.path}
								{root.line ? `:${root.line}` : ""}
							</span>
						</span>
					)}
					{root.resolved && (
						<button
							type="button"
							className="ml-auto flex shrink-0 items-center gap-1 rounded hover:text-foreground"
							onClick={() => setOpen(!open)}
						>
							<LuCheck className="size-3.5" />
							<Trans>Resolved</Trans>
							{open ? (
								<LuChevronDown className="size-3.5" />
							) : (
								<LuChevronRight className="size-3.5" />
							)}
						</button>
					)}
				</header>
			)}
			{open && (
				<div className="divide-y divide-border/40">
					{[root, ...thread.replies].map((comment) => (
						<div key={comment.id} className="flex min-w-0 gap-3 px-3 py-3">
							<ForkUserAvatar name={comment.author} className="mt-0.5" />
							<div className="min-w-0 flex-1 space-y-1">
								<p className="flex min-w-0 items-center gap-1.5 text-xs">
									<span className="truncate font-medium">{comment.author}</span>
									<span className="text-muted-foreground">
										<ForkRelativeTime value={comment.createdAt} />
									</span>
								</p>
								<div className="overflow-x-auto break-words">
									{comment.deleted ? (
										<span className="text-muted-foreground italic">
											<Trans>Deleted comment</Trans>
										</span>
									) : (
										<CommentBody body={comment.body} />
									)}
								</div>
							</div>
						</div>
					))}
					{canReply && (
						<div className="space-y-2 bg-muted/10 px-3 py-2">
							{replying && (
								<ForkCommentComposer
									compact
									disabled={busy}
									placeholder={t({ message: "Write a reply" })}
									onSubmit={(text) =>
										onReply(root.id, text).then(() => setReplying(false))
									}
								/>
							)}
							<div className="flex gap-1">
								{replying ? (
									<Button
										size="xs"
										variant="ghost"
										onClick={() => setReplying(false)}
									>
										<Trans>Cancel</Trans>
									</Button>
								) : (
									<Button
										size="xs"
										variant="ghost"
										disabled={busy}
										onClick={() => setReplying(true)}
									>
										<LuReply className="size-3.5" />
										<Trans>Reply</Trans>
									</Button>
								)}
								{root.path && (
									<Button
										size="xs"
										variant="ghost"
										disabled={busy}
										onClick={() => onResolve(root.id, !root.resolved)}
									>
										{root.resolved ? (
											<>
												<LuRotateCcw className="size-3.5" />
												<Trans>Reopen thread</Trans>
											</>
										) : (
											<>
												<LuCheck className="size-3.5" />
												<Trans>Resolve</Trans>
											</>
										)}
									</Button>
								)}
							</div>
						</div>
					)}
				</div>
			)}
		</article>
	);
}
