import { expect, test } from "bun:test";
import { forkReviewThreads, forkSplitDiff } from "./forkReviewThreads";

const comment = (id: string, createdAt: string, parentId?: string) => ({
	id,
	author: "ada",
	body: id,
	createdAt,
	...(parentId ? { parentId } : {}),
});

test("replies, also to other replies, stay in their thread in time order", () => {
	const threads = forkReviewThreads([
		comment("3", "2026-01-03", "2"),
		comment("1", "2026-01-01"),
		comment("2", "2026-01-02", "1"),
		comment("4", "2026-01-04"),
		{ ...comment("5", "2026-01-05"), deleted: true },
	]);
	expect(threads.map((t) => [t.root.id, t.replies.map((r) => r.id)])).toEqual([
		["1", ["2", "3"]],
		["4", []],
	]);
});

test("a multi-file diff splits per file, including deleted files", () => {
	const files = forkSplitDiff(
		[
			"diff --git a/src/a.ts b/src/a.ts",
			"--- a/src/a.ts",
			"+++ b/src/a.ts",
			"@@ -1 +1 @@",
			"-old",
			"+new",
			"diff --git a/gone.ts b/gone.ts",
			"--- a/gone.ts",
			"+++ /dev/null",
			"@@ -1 +0,0 @@",
			"-x",
			"",
		].join("\n"),
	);
	expect(files.map((f) => f.path)).toEqual(["src/a.ts", "gone.ts"]);
	expect(files[0]?.patch.startsWith("diff --git a/src/a.ts")).toBe(true);
});
