/**
 * Jira stores rich text as Atlassian Document Format. The app edits and shows
 * it as Markdown, so a description survives an edit with its structure.
 */

export interface AdfMark {
	type: string;
	attrs?: { href?: string };
}
export interface AdfNode {
	type?: string;
	text?: string;
	marks?: AdfMark[];
	attrs?: {
		level?: number;
		order?: number;
		language?: string | null;
		text?: string;
		shortName?: string;
		url?: string;
		timestamp?: string;
		href?: string;
	};
	content?: AdfNode[];
}

function inlineMarkdown(nodes: AdfNode[] = []): string {
	return nodes
		.map((node) => {
			if (node.type === "hardBreak") return "\n";
			if (node.type === "mention" || node.type === "emoji")
				return node.attrs?.text ?? node.attrs?.shortName ?? "";
			if (node.type === "inlineCard" || node.type === "blockCard")
				return node.attrs?.url ?? "";
			if (node.type === "status") return node.attrs?.text ?? "";
			if (node.type === "date" && node.attrs?.timestamp)
				return new Date(Number(node.attrs.timestamp))
					.toISOString()
					.slice(0, 10);
			if (node.type !== "text") return inlineMarkdown(node.content);
			let text = node.text ?? "";
			const marks = node.marks ?? [];
			if (marks.some((m) => m.type === "code")) return `\`${text}\``;
			if (marks.some((m) => m.type === "strong")) text = `**${text}**`;
			if (marks.some((m) => m.type === "em")) text = `_${text}_`;
			if (marks.some((m) => m.type === "strike")) text = `~~${text}~~`;
			const link = marks.find((m) => m.type === "link")?.attrs?.href;
			return link ? `[${text}](${link})` : text;
		})
		.join("");
}

function indent(text: string, prefix: string): string {
	return text
		.split("\n")
		.map((line, i) => (i === 0 || !line ? line : `${prefix}${line}`))
		.join("\n");
}

function blockMarkdown(node: AdfNode): string {
	const children = node.content ?? [];
	switch (node.type) {
		case "doc":
			return children.map(blockMarkdown).filter(Boolean).join("\n\n");
		case "paragraph":
			return inlineMarkdown(children);
		case "heading":
			return `${"#".repeat(node.attrs?.level ?? 1)} ${inlineMarkdown(children)}`;
		case "bulletList":
		case "orderedList": {
			const start = node.attrs?.order ?? 1;
			return children
				.map((item, i) => {
					const marker = node.type === "orderedList" ? `${start + i}.` : "-";
					const body = (item.content ?? [])
						.map(blockMarkdown)
						.filter(Boolean)
						.join("\n");
					return `${marker} ${indent(body, " ".repeat(marker.length + 1))}`;
				})
				.join("\n");
		}
		case "codeBlock":
			return `\`\`\`${node.attrs?.language ?? ""}\n${inlineMarkdown(children)}\n\`\`\``;
		case "blockquote":
		case "panel":
			return children
				.map(blockMarkdown)
				.join("\n\n")
				.split("\n")
				.map((line) => `> ${line}`.trimEnd())
				.join("\n");
		case "rule":
			return "---";
		case "table": {
			const rows = children.map((row) =>
				(row.content ?? []).map((cell) =>
					(cell.content ?? [])
						.map(blockMarkdown)
						.join(" ")
						.replaceAll("|", "\\|")
						.replaceAll("\n", " "),
				),
			);
			const [head, ...rest] = rows;
			if (!head) return "";
			return [
				`| ${head.join(" | ")} |`,
				`| ${head.map(() => "---").join(" | ")} |`,
				...rest.map((row) => `| ${row.join(" | ")} |`),
			].join("\n");
		}
		case "mediaSingle":
		case "mediaGroup":
		case "media":
			return "";
		default:
			return children.length > 0
				? children.map(blockMarkdown).filter(Boolean).join("\n\n")
				: inlineMarkdown([node]);
	}
}

export function adfToMarkdown(
	node: AdfNode | string | null | undefined,
): string {
	if (!node) return "";
	if (typeof node === "string") return node;
	return blockMarkdown(node).trim();
}

const INLINE =
	/(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(~~[^~]+~~)|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)|(\[[^\]]+\]\([^)\s]+\))/;

function textNodes(text: string, marks: AdfMark[] = []): AdfNode[] {
	const nodes: AdfNode[] = [];
	let rest = text;
	while (rest) {
		const match = INLINE.exec(rest);
		if (!match) {
			nodes.push({
				type: "text",
				text: rest,
				...(marks.length ? { marks } : {}),
			});
			break;
		}
		if (match.index > 0)
			nodes.push({
				type: "text",
				text: rest.slice(0, match.index),
				...(marks.length ? { marks } : {}),
			});
		const token = match[0];
		if (token.startsWith("`"))
			nodes.push({
				type: "text",
				text: token.slice(1, -1),
				marks: [...marks, { type: "code" }],
			});
		else if (token.startsWith("**") || token.startsWith("__"))
			nodes.push(
				...textNodes(token.slice(2, -2), [...marks, { type: "strong" }]),
			);
		else if (token.startsWith("~~"))
			nodes.push(
				...textNodes(token.slice(2, -2), [...marks, { type: "strike" }]),
			);
		else if (token.startsWith("["))
			nodes.push(
				...textNodes(token.slice(1, token.indexOf("](")), [
					...marks,
					{
						type: "link",
						attrs: { href: token.slice(token.indexOf("](") + 2, -1) },
					},
				]),
			);
		else
			nodes.push(...textNodes(token.slice(1, -1), [...marks, { type: "em" }]));
		rest = rest.slice(match.index + token.length);
	}
	return nodes;
}

function inlineAdf(text: string): AdfNode[] {
	return text
		.split("\n")
		.flatMap((line, i) => [
			...(i > 0 ? [{ type: "hardBreak" }] : []),
			...(line ? textNodes(line) : []),
		]);
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

function listAdf(lines: string[]): AdfNode {
	const first = LIST_ITEM.exec(lines[0] ?? "");
	const ordered = !!first && /^\d/.test(first[2] ?? "");
	const base = first?.[1]?.length ?? 0;
	const items: AdfNode[] = [];
	let nested: string[] = [];
	const flush = () => {
		const item = items.at(-1);
		if (item && nested.length > 0)
			item.content?.push(
				listAdf(
					nested.map((line) =>
						line.slice(Math.min(base + 2, line.search(/\S/))),
					),
				),
			);
		nested = [];
	};
	for (const line of lines) {
		const match = LIST_ITEM.exec(line);
		if (match && (match[1]?.length ?? 0) <= base) {
			flush();
			items.push({
				type: "listItem",
				content: [{ type: "paragraph", content: inlineAdf(match[3] ?? "") }],
			});
		} else nested.push(line);
	}
	flush();
	return {
		type: ordered ? "orderedList" : "bulletList",
		...(ordered
			? { attrs: { order: Number.parseInt(first?.[2] ?? "1", 10) } }
			: {}),
		content: items,
	};
}

function blocksAdf(markdown: string): AdfNode[] {
	const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
	const blocks: AdfNode[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i] ?? "";
		if (!line.trim()) {
			i++;
			continue;
		}
		const fence = /^```\s*(\S*)\s*$/.exec(line);
		if (fence) {
			const code: string[] = [];
			i++;
			while (i < lines.length && !/^```\s*$/.test(lines[i] ?? ""))
				code.push(lines[i++] ?? "");
			i++;
			blocks.push({
				type: "codeBlock",
				...(fence[1] ? { attrs: { language: fence[1] } } : {}),
				content: code.length ? [{ type: "text", text: code.join("\n") }] : [],
			});
			continue;
		}
		const heading = /^(#{1,6})\s+(.*)$/.exec(line);
		if (heading) {
			blocks.push({
				type: "heading",
				attrs: { level: heading[1]?.length ?? 1 },
				content: inlineAdf(heading[2] ?? ""),
			});
			i++;
			continue;
		}
		if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
			blocks.push({ type: "rule" });
			i++;
			continue;
		}
		if (line.startsWith(">")) {
			const quoted: string[] = [];
			while (i < lines.length && (lines[i] ?? "").startsWith(">"))
				quoted.push((lines[i++] ?? "").replace(/^>\s?/, ""));
			blocks.push({
				type: "blockquote",
				content: blocksAdf(quoted.join("\n")),
			});
			continue;
		}
		if (LIST_ITEM.test(line)) {
			const items: string[] = [];
			while (
				i < lines.length &&
				(LIST_ITEM.test(lines[i] ?? "") || /^\s+\S/.test(lines[i] ?? ""))
			)
				items.push(lines[i++] ?? "");
			blocks.push(listAdf(items));
			continue;
		}
		if (line.trim().startsWith("|")) {
			const rows: string[][] = [];
			while (i < lines.length && (lines[i] ?? "").trim().startsWith("|")) {
				const cells = (lines[i++] ?? "")
					.trim()
					.replace(/^\||\|$/g, "")
					.split(/(?<!\\)\|/)
					.map((cell) => cell.trim().replaceAll("\\|", "|"));
				if (!cells.every((cell) => /^:?-{3,}:?$/.test(cell))) rows.push(cells);
			}
			blocks.push({
				type: "table",
				content: rows.map((cells, r) => ({
					type: "tableRow",
					content: cells.map((cell) => ({
						type: r === 0 ? "tableHeader" : "tableCell",
						content: [{ type: "paragraph", content: inlineAdf(cell) }],
					})),
				})),
			});
			continue;
		}
		const paragraph: string[] = [];
		while (
			i < lines.length &&
			(lines[i] ?? "").trim() &&
			!/^(```|#{1,6}\s|>|\s*\|)/.test(lines[i] ?? "") &&
			!LIST_ITEM.test(lines[i] ?? "")
		)
			paragraph.push(lines[i++] ?? "");
		blocks.push({
			type: "paragraph",
			content: inlineAdf(paragraph.join("\n")),
		});
	}
	return blocks;
}

export function markdownToAdf(markdown: string) {
	return { type: "doc", version: 1, content: blocksAdf(markdown) };
}
