import { fileUrl, TICKET_QUERY_PARAM } from "@superset/shared/usercontent";

const FILE_ID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOST_ATTACHMENT_PATH =
	/^\/usercontent\/ticket\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const MEDIA_FILE_PATH =
	/^\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/([^/?#]+))?$/i;
const TICKET_PATH = /^\/usercontent\/ticket\/([^/?#]+)$/i;

export type ParsedTicketedMediaLink =
	| { kind: "host-attachment"; attachmentId: string }
	| {
			kind: "media-file";
			fileId: string;
			filename?: string;
			ticket?: string;
	  };

function decodeJsonBase64Url(segment: string): Record<string, unknown> | null {
	const padded =
		segment.replace(/-/g, "+").replace(/_/g, "/") +
		"=".repeat((4 - (segment.length % 4)) % 4);
	try {
		const json = atob(padded);
		const value: unknown = JSON.parse(json);
		return value && typeof value === "object"
			? (value as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

/** Best-effort decode of a usercontent file ticket or JWT carrying a file id. */
function fileIdFromTicketToken(token: string): string | null {
	if (FILE_ID.test(token)) return token.toLowerCase();

	const jwtParts = token.split(".");
	if (jwtParts.length === 3) {
		const payload = jwtParts[1];
		if (payload) {
			const claims = decodeJsonBase64Url(payload);
			const fileId = claims?.fileId;
			if (typeof fileId === "string" && FILE_ID.test(fileId))
				return fileId.toLowerCase();
		}
	}

	const dot = token.indexOf(".");
	if (dot === -1) return null;
	const claims = decodeJsonBase64Url(token.slice(0, dot));
	const fileId = claims?.fileId;
	if (typeof fileId === "string" && FILE_ID.test(fileId))
		return fileId.toLowerCase();
	return null;
}

export function parseTicketedMediaLink(
	href: string,
): ParsedTicketedMediaLink | null {
	let url: URL;
	try {
		url = new URL(href);
	} catch {
		return null;
	}

	const hostAttachment = HOST_ATTACHMENT_PATH.exec(url.pathname);
	if (hostAttachment) {
		return { kind: "host-attachment", attachmentId: hostAttachment[1] };
	}

	const media = MEDIA_FILE_PATH.exec(url.pathname);
	if (media) {
		const ticket = url.searchParams.get(TICKET_QUERY_PARAM) ?? undefined;
		const filename = media[2] ? decodeURIComponent(media[2]) : undefined;
		return {
			kind: "media-file",
			fileId: media[1].toLowerCase(),
			...(filename ? { filename } : {}),
			...(ticket ? { ticket } : {}),
		};
	}

	const ticketPath = TICKET_PATH.exec(url.pathname);
	if (!ticketPath) return null;
	const token = decodeURIComponent(ticketPath[1]);
	const fileId = fileIdFromTicketToken(token);
	if (!fileId) return null;
	return {
		kind: "media-file",
		fileId,
		ticket: token.includes(".") ? token : undefined,
	};
}

/**
 * App file URLs are minted for the media host; local web/admin ports often
 * rewrite them to `/usercontent/ticket/...` without a server behind it.
 */
export function rewriteTicketedMediaUrl(
	href: string,
	mediaBaseUrl: string,
): string | null {
	const parsed = parseTicketedMediaLink(href);
	if (!parsed || parsed.kind !== "media-file") return null;
	return fileUrl({
		baseUrl: mediaBaseUrl,
		fileId: parsed.fileId,
		...(parsed.filename ? { filename: parsed.filename } : {}),
		...(parsed.ticket ? { ticket: parsed.ticket } : {}),
	});
}
