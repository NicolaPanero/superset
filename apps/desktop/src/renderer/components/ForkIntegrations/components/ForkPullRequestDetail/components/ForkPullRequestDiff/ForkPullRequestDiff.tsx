import { Trans, useLingui } from "@lingui/react/macro";
import { PatchDiff } from "@pierre/diffs/react";
import { Button } from "@superset/ui/button";
import { Textarea } from "@superset/ui/textarea";
import { type CSSProperties, useMemo, useState } from "react";
import { LuPlus } from "react-icons/lu";
import {
	getDiffsTheme,
	getDiffViewerStyle,
} from "renderer/screens/main/components/WorkspaceView/utils/code-theme";
import { useResolvedTheme } from "renderer/stores/theme";
import {
	type ForkReviewThread,
	forkSplitDiff,
} from "../../utils/forkReviewThreads";
import { ForkCommentThread } from "../ForkCommentThread";

/** A thread under its line, or null for the comment being written. */
interface Annotation {
	thread: ForkReviewThread | null;
}

/**
 * A pull request diff with its inline threads under their lines. The "+"
 * beside a line opens a comment on it.
 */
export function ForkPullRequestDiff({
	diff,
	threads,
	busy,
	canComment,
	onComment,
	onReply,
	onResolve,
}: {
	diff: string;
	threads: ForkReviewThread[];
	busy: boolean;
	canComment: boolean;
	onComment: (
		path: string,
		line: number,
		body: string,
		side: "old" | "new",
	) => Promise<unknown>;
	onReply: (commentId: string, body: string) => Promise<unknown>;
	onResolve: (commentId: string, resolved: boolean) => void;
}) {
	const { t } = useLingui();
	const theme = useResolvedTheme();
	const files = useMemo(() => forkSplitDiff(diff), [diff]);
	const [draft, setDraft] = useState<{
		path: string;
		line: number;
		side: "old" | "new";
	} | null>(null);
	const [body, setBody] = useState("");
	const style = getDiffViewerStyle(theme, { fontSize: 12 }) as CSSProperties;
	if (!files.length)
		return (
			<pre className="overflow-x-auto rounded-lg border bg-muted/20 p-4 font-mono text-xs">
				{diff}
			</pre>
		);
	return (
		<div className="space-y-4">
			{files.map((file) => {
				const annotations = [
					...threads
						.filter(
							(thread) => thread.root.path === file.path && thread.root.line,
						)
						.map((thread) => ({
							side:
								thread.root.side === "old"
									? ("deletions" as const)
									: ("additions" as const),
							lineNumber: thread.root.line ?? 0,
							metadata: { thread },
						})),
					...(draft?.path === file.path
						? [
								{
									side:
										draft.side === "old"
											? ("deletions" as const)
											: ("additions" as const),
									lineNumber: draft.line,
									metadata: { thread: null },
								},
							]
						: []),
				];
				return (
					<section
						key={file.path}
						className="overflow-hidden rounded-lg border"
					>
						<PatchDiff<Annotation>
							patch={file.patch}
							style={style}
							options={{
								theme: getDiffsTheme(theme),
								themeType: theme.type,
								diffStyle: "unified",
								overflow: "scroll",
							}}
							lineAnnotations={annotations}
							renderAnnotation={({ metadata }) =>
								metadata.thread ? (
									<div className="p-2">
										<ForkCommentThread
											thread={metadata.thread}
											busy={busy}
											canReply={canComment}
											showLocation={false}
											onReply={onReply}
											onResolve={onResolve}
										/>
									</div>
								) : (
									<div className="space-y-2 p-2">
										<Textarea
											autoFocus
											aria-label={t({ message: "Comment" })}
											className="min-h-16"
											value={body}
											onChange={(e) => setBody(e.target.value)}
										/>
										<div className="flex gap-2">
											<Button
												size="sm"
												disabled={!body.trim() || busy || !draft}
												onClick={() => {
													if (!draft) return;
													void onComment(
														draft.path,
														draft.line,
														body,
														draft.side,
													).then(
														() => {
															setBody("");
															setDraft(null);
														},
														() => undefined,
													);
												}}
											>
												<Trans>Add comment</Trans>
											</Button>
											<Button
												size="sm"
												variant="ghost"
												onClick={() => setDraft(null)}
											>
												<Trans>Cancel</Trans>
											</Button>
										</div>
									</div>
								)
							}
							renderGutterUtility={
								canComment
									? (hovered) => (
											<button
												type="button"
												aria-label={t({ message: "Comment on this line" })}
												className="flex size-4 items-center justify-center rounded bg-primary text-primary-foreground"
												onClick={() => {
													const line = hovered();
													if (line)
														setDraft({
															path: file.path,
															line: line.lineNumber,
															side: line.side === "deletions" ? "old" : "new",
														});
												}}
											>
												<LuPlus className="size-3" />
											</button>
										)
									: undefined
							}
						/>
					</section>
				);
			})}
		</div>
	);
}
