import { describe, expect, test } from "bun:test";
import {
	parseTicketedMediaLink,
	rewriteTicketedMediaUrl,
} from "./parseTicketedMediaLink";

const FILE = "11111111-2222-4333-8444-555555555555";
const MEDIA = "http://media.usercontent.localhost:8787";

describe("parseTicketedMediaLink", () => {
	test("reads a host attachment id from the legacy ticket path", () => {
		expect(
			parseTicketedMediaLink(
				`http://localhost:3003/usercontent/ticket/${FILE}`,
			),
		).toEqual({ kind: "host-attachment", attachmentId: FILE });
	});

	test("reads a media file path with a ticket query", () => {
		expect(
			parseTicketedMediaLink(
				`http://localhost:3003/files/${FILE}/shot.png?ticket=abc.def`,
			),
		).toEqual({
			kind: "media-file",
			fileId: FILE,
			filename: "shot.png",
			ticket: "abc.def",
		});
	});

	test("extracts a file id from a usercontent ticket token in the path", () => {
		const payload = btoa(
			JSON.stringify({ kind: "file", fileId: FILE, contentType: "image/png" }),
		)
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");
		const token = `${payload}.signature`;
		expect(
			parseTicketedMediaLink(
				`http://localhost:3000/usercontent/ticket/${encodeURIComponent(token)}`,
			),
		).toEqual({
			kind: "media-file",
			fileId: FILE,
			ticket: token,
		});
	});
});

describe("rewriteTicketedMediaUrl", () => {
	test("rewrites a broken app-origin link onto the media host", () => {
		const href = `http://localhost:3003/files/${FILE}/a.png?ticket=tok`;
		expect(rewriteTicketedMediaUrl(href, MEDIA)).toBe(
			`http://media.usercontent.localhost:8787/files/${FILE}/a.png?ticket=tok`,
		);
	});
});
