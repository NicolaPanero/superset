import { describe, expect, it } from "bun:test";
import { parseTextToEditorContent } from "./parseTextToEditorContent";

const linear = { name: "linear", displayName: "Linear", description: "" };

describe("parseTextToEditorContent", () => {
	it("restores a known plugin handle as a plugin mention and paths as file mentions", () => {
		const doc = parseTextToEditorContent("Ask @linear about @src/app.ts", [
			linear,
		]);
		expect(doc.content?.[0]?.content).toEqual([
			{ type: "text", text: "Ask " },
			{ type: "plugin-mention", attrs: { name: "linear", label: "Linear" } },
			{ type: "text", text: " about " },
			{ type: "file-mention", attrs: { path: "src/app.ts" } },
		]);
	});

	it("reads every handle as a file without a plugin list", () => {
		const doc = parseTextToEditorContent("@linear");
		expect(doc.content?.[0]?.content).toEqual([
			{ type: "file-mention", attrs: { path: "linear" } },
		]);
	});

	it("never turns a quoted path into a plugin", () => {
		const doc = parseTextToEditorContent('see @"linear"', [linear]);
		expect(doc.content?.[0]?.content).toEqual([
			{ type: "text", text: "see " },
			{ type: "file-mention", attrs: { path: "linear" } },
		]);
	});

	it("leaves a handle glued to a word alone", () => {
		const doc = parseTextToEditorContent("mail avi@linear", [linear]);
		expect(doc.content?.[0]?.content).toEqual([
			{ type: "text", text: "mail avi@linear" },
		]);
	});
});
