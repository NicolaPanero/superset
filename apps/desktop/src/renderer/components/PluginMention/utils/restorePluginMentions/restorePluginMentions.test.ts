import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();

const { afterAll, describe, expect, it } = await import("bun:test");
const { Editor } = await import("@tiptap/core");
const { default: Document } = await import("@tiptap/extension-document");
const { default: Paragraph } = await import("@tiptap/extension-paragraph");
const { default: Text } = await import("@tiptap/extension-text");
const { FileMentionNode } = await import(
	"renderer/components/TiptapPromptEditor/FileMentionNode"
);
const { PluginMentionNode } = await import("../../PluginMentionNode");
const { restorePluginMentions } = await import("./restorePluginMentions");

afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const linear = { name: "linear", displayName: "Linear", description: "" };
const resolve = (name: string) => (name === "linear" ? linear : null);

function editorWith(content: object) {
	return new Editor({
		extensions: [Document, Paragraph, Text, FileMentionNode, PluginMentionNode],
		content,
	});
}

function nodeNames(editor: InstanceType<typeof Editor>) {
	const names: string[] = [];
	editor.state.doc.firstChild?.forEach((node) => {
		names.push(node.isText ? `text:${node.text}` : node.type.name);
	});
	return names;
}

describe("restorePluginMentions", () => {
	it("turns bare known handles in text into chips and leaves the rest alone", () => {
		const editor = editorWith({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{ type: "text", text: "Ask @linear. then @slack, mail a@linear" },
					],
				},
			],
		});
		expect(restorePluginMentions(editor, resolve)).toBe(true);
		expect(nodeNames(editor)).toEqual([
			"text:Ask ",
			"plugin-mention",
			"text:. then @slack, mail a@linear",
		]);
		expect(editor.getText()).toBe("Ask @linear. then @slack, mail a@linear");
		expect(restorePluginMentions(editor, resolve)).toBe(false);
		editor.destroy();
	});

	it("swaps a file chip restored from text for the plugin, but keeps a picked file", () => {
		const editor = editorWith({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{ type: "file-mention", attrs: { path: "linear", fromText: true } },
						{ type: "text", text: " vs " },
						{
							type: "file-mention",
							attrs: { path: "linear", fromText: false },
						},
					],
				},
			],
		});
		expect(restorePluginMentions(editor, resolve)).toBe(true);
		expect(nodeNames(editor)).toEqual([
			"plugin-mention",
			"text: vs ",
			"file-mention",
		]);
		editor.destroy();
	});
});
