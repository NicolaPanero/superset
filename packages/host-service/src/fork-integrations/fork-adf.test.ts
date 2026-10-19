import { expect, test } from "bun:test";
import { adfToMarkdown, markdownToAdf } from "./fork-adf";

test("a Jira description keeps its structure through Markdown and back", () => {
	const markdown = [
		"## Steps",
		"",
		"Open the **settings** page, see [docs](https://example.com/docs) and `npm test`.",
		"Second line of the same paragraph.",
		"",
		"- first",
		"  - nested",
		"- second",
		"",
		"1. one",
		"2. two",
		"",
		"> quoted",
		"",
		"```ts",
		"const a = 1;",
		"```",
		"",
		"| Name | Value |",
		"| --- | --- |",
		"| a | 1 |",
		"",
		"---",
	].join("\n");
	expect(adfToMarkdown(markdownToAdf(markdown))).toBe(markdown);
});

test("Jira-only nodes become readable text", () => {
	expect(
		adfToMarkdown({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{ type: "mention", attrs: { text: "@Ada" } },
						{ type: "text", text: " see " },
						{ type: "inlineCard", attrs: { url: "https://example.com/1" } },
						{ type: "hardBreak" },
						{ type: "status", attrs: { text: "BLOCKED" } },
					],
				},
				{ type: "mediaSingle", content: [{ type: "media" }] },
			],
		}),
	).toBe("@Ada see https://example.com/1\nBLOCKED");
});
