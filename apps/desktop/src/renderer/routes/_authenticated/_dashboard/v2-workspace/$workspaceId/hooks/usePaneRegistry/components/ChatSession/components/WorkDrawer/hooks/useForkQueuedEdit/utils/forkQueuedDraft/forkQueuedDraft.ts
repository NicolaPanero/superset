import { appendPastedText, userMessageText } from "@superset/chat/core";
import type { UserMessage } from "@superset/chat/protocol";
import {
	type AttachmentTag,
	parseAttachmentTags,
} from "../../../../../../utils/attachmentTags";

type StoredAttachment = Extract<
	UserMessage["content"][number],
	{ type: "attachment" }
>;
export async function forkQueuedDraft(
	prompt: UserMessage,
	load: {
		workspace: (attachment: AttachmentTag) => Promise<File>;
		stored: (attachment: StoredAttachment) => Promise<File>;
	},
) {
	const { text, attachments, pastedTexts } = parseAttachmentTags(
		userMessageText(prompt),
	);
	const files = await Promise.all([
		...attachments.map(load.workspace),
		...prompt.content.flatMap((part) =>
			part.type === "attachment" ? [load.stored(part)] : [],
		),
	]);
	return { text: appendPastedText(text, pastedTexts), files };
}

export function forkQueuedFile(data: string, name: string, type: string): File {
	return new File(
		[Uint8Array.from(atob(data), (char) => char.charCodeAt(0))],
		name,
		{ type },
	);
}
