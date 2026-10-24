import { expect, test } from "bun:test";
import type { ExternalApp } from "@superset/local-db";
import { forkChooseAndOpenEditor } from "./fork-editor-choice";

test("an unconfigured editor opens the chosen app and remembers it only after launch succeeds", async () => {
	const events: string[] = [];
	await forkChooseAndOpenEditor(
		"/project/file.ts",
		async (path, editor) => {
			events.push(`open:${editor}:${path}`);
		},
		(editor) => events.push(`remember:${editor}`),
		async () => "cursor",
	);
	expect(events).toEqual(["open:cursor:/project/file.ts", "remember:cursor"]);
});

test("cancelling editor selection leaves the file closed and preferences untouched", async () => {
	const events: string[] = [];
	await forkChooseAndOpenEditor(
		"/project/file.ts",
		async () => {
			events.push("open");
		},
		() => events.push("remember"),
		async () => null,
	);
	expect(events).toEqual([]);
});

test("a missing editor cannot become the saved default", async () => {
	let remembered: ExternalApp | undefined;
	await expect(
		forkChooseAndOpenEditor(
			"/project/file.ts",
			async () => {
				throw new Error("Application is not installed");
			},
			(editor) => {
				remembered = editor;
			},
			async () => "vscode",
		),
	).rejects.toThrow("Application is not installed");
	expect(remembered).toBeUndefined();
});
