import type { ForkComment } from "@superset/shared/fork-integrations";

export interface ForkReviewThread {
	root: ForkComment;
	replies: ForkComment[];
}

/** Root comments in order with their replies; replies to replies stay in the thread. */
export function forkReviewThreads(comments: ForkComment[]): ForkReviewThread[] {
	const byId = new Map(comments.map((comment) => [comment.id, comment]));
	const rootOf = (comment: ForkComment): ForkComment => {
		let current = comment;
		const seen = new Set<string>();
		while (current.parentId && !seen.has(current.id)) {
			seen.add(current.id);
			const parent = byId.get(current.parentId);
			if (!parent) break;
			current = parent;
		}
		return current;
	};
	const threads = new Map<string, ForkReviewThread>();
	for (const comment of [...comments].sort((a, b) =>
		a.createdAt.localeCompare(b.createdAt),
	)) {
		const root = rootOf(comment);
		const thread = threads.get(root.id) ?? { root, replies: [] };
		if (comment.id !== root.id) thread.replies.push(comment);
		threads.set(root.id, thread);
	}
	return [...threads.values()].filter(
		(thread) =>
			!thread.root.deleted || thread.replies.some((reply) => !reply.deleted),
	);
}

export interface ForkDiffFile {
	path: string;
	patch: string;
}

/** One entry per file of a unified diff, keyed by the new path. */
export function forkSplitDiff(diff: string): ForkDiffFile[] {
	return diff
		.split(/^(?=diff --git )/m)
		.filter((chunk) => chunk.startsWith("diff --git "))
		.map((patch) => {
			const next = /^\+\+\+ (?:b\/)?(.+)$/m.exec(patch)?.[1];
			const header = /^diff --git a\/(.+?) b\/(.+)$/m.exec(patch);
			const path =
				next && next !== "/dev/null"
					? next
					: (header?.[2] ?? header?.[1] ?? "");
			return { path: path.trim(), patch };
		});
}
