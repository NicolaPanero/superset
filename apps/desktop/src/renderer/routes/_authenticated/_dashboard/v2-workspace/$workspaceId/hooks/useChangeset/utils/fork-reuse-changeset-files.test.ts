import { expect, test } from "bun:test";
import type { ChangesetFile } from "../types";
import { forkReuseChangesetFiles } from "./fork-reuse-changeset-files";

const file = (path: string, additions: number): ChangesetFile => ({
	path,
	status: "modified",
	additions,
	deletions: 0,
	source: { kind: "unstaged" },
});

test("keeps unchanged files and the whole array when nothing changed", () => {
	const previous = [file("a.ts", 1), file("b.ts", 2)];
	expect(
		forkReuseChangesetFiles(previous, [file("a.ts", 1), file("b.ts", 2)]),
	).toBe(previous);
});

test("replaces only the changed file", () => {
	const previous = [file("a.ts", 1), file("b.ts", 2)];
	const next = forkReuseChangesetFiles(previous, [
		file("a.ts", 1),
		file("b.ts", 5),
	]);
	expect(next).not.toBe(previous);
	expect(next[0]).toBe(previous[0]);
	expect(next[1]?.additions).toBe(5);
});

test("returns a new array when files are added or removed", () => {
	const previous = [file("a.ts", 1)];
	const next = forkReuseChangesetFiles(previous, [
		file("a.ts", 1),
		file("c.ts", 3),
	]);
	expect(next).toHaveLength(2);
	expect(next[0]).toBe(previous[0]);
});
