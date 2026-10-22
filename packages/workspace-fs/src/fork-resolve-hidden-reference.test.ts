import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveFileReference } from "./resolve-file-reference";

const roots: string[] = [];
afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function workspaceWith(...relativePaths: string[]) {
	const root = mkdtempSync(join(tmpdir(), "fork-hidden-reference-"));
	roots.push(root);
	for (const relativePath of relativePaths) {
		const file = join(root, relativePath);
		mkdirSync(join(file, ".."), { recursive: true });
		writeFileSync(file, "");
	}
	return root;
}

test("a bare file name finds a file an agent wrote inside a hidden folder", async () => {
	const root = workspaceWith(".tmp-demo/clips/demo-1.mp4");
	const match = await resolveFileReference({
		rootPath: root,
		reference: "demo-1.mp4",
	});
	expect(match?.relativePath).toBe(".tmp-demo/clips/demo-1.mp4");
	expect(match?.absolutePath).toBe(join(root, ".tmp-demo/clips/demo-1.mp4"));
});

test("a visible file still wins over a hidden file with the same name", async () => {
	const root = workspaceWith("docs/demo-2.mp4", ".tmp-demo/demo-2.mp4");
	const match = await resolveFileReference({
		rootPath: root,
		reference: "demo-2.mp4",
	});
	expect(match?.relativePath).toBe("docs/demo-2.mp4");
});

test("a name that exists nowhere is still not found", async () => {
	const root = workspaceWith(".tmp-demo/other.mp4");
	expect(
		await resolveFileReference({
			rootPath: root,
			reference: "nothing-here.mp4",
		}),
	).toBeNull();
});
