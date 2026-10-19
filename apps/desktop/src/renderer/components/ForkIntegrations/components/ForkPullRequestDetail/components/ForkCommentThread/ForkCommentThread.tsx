import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Textarea } from "@superset/ui/textarea";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuCheck, LuRotateCcw } from "react-icons/lu";
import { CommentBody } from "renderer/components/CommentBody";
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
	const [reply, setReply] = useState("");
	const [open, setOpen] = useState(!thread.root.resolved);
	const { root } = thread;
	return (
		<article
			className={cn(
				"rounded-lg border bg-background text-sm",
				root.resolved && "opacity-70",
			)}
		>
			<header className="flex items-center gap-2 border-b px-3 py-2 text-xs">
				<span className="font-medium">{root.author}</span>
				{showLocation && root.path && (
					<span className="min-w-0 truncate font-mono text-muted-foreground">
						{root.path}
						{root.line ? `:${root.line}` : ""}
					</span>
				)}
				{root.resolved && (
					<button
						type="button"
						className="ml-auto text-muted-foreground hover:text-foreground"
						onClick={() => setOpen(!open)}
					>
						{open ? <Trans>Hide</Trans> : <Trans>Resolved · show</Trans>}
					</button>
				)}
			</header>
			{open && (
				<div className="space-y-3 p-3">
					{[root, ...thread.replies].map((comment) => (
						<div key={comment.id} className="min-w-0 space-y-1">
							{comment !== root && (
								<p className="text-xs font-medium">{comment.author}</p>
							)}
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
					))}
					{canReply && (
						<div className="space-y-2">
							<Textarea
								aria-label={t({ message: "Reply" })}
								placeholder={t({ message: "Reply" })}
								className="min-h-16"
								value={reply}
								onChange={(e) => setReply(e.target.value)}
							/>
							<div className="flex gap-2">
								<Button
									size="sm"
									disabled={!reply.trim() || busy}
									onClick={() =>
										void onReply(root.id, reply).then(
											() => setReply(""),
											() => undefined,
										)
									}
								>
									<Trans>Reply</Trans>
								</Button>
								{root.path && (
									<Button
										size="sm"
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
