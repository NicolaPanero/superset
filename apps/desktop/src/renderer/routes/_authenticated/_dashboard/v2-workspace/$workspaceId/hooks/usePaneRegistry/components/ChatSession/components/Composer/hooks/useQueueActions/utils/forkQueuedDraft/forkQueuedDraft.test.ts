import { expect, test } from "bun:test";
import type { UserMessage } from "@superset/chat/protocol";
import { forkQueuedDraft, forkQueuedFile } from "./forkQueuedDraft";

const prompt: UserMessage = {
	id: "queued",
	kind: "user_message",
	startedAtMs: 1,
	content: [
		{
			type: "text",
			text: 'Review this\n<attachment path=".superset/attachments/screen.png" type="image/png" />',
		},
		{
			type: "attachment",
			attachmentId: "stored",
			name: "notes.txt",
			mimeType: "text/plain",
		},
	],
};

test("restores workspace images and stored attachments in order with their original bytes", async () => {
	const draft = await forkQueuedDraft(prompt, {
		workspace: async (attachment) =>
			forkQueuedFile(
				"AP8B",
				attachment.path.split("/").pop() ?? "",
				attachment.type,
			),
		stored: async (attachment) =>
			forkQueuedFile("bm90ZXM=", attachment.name, attachment.mimeType),
	});
	expect(draft.text).toBe("Review this");
	expect(draft.files.map((file) => [file.name, file.type])).toEqual([
		["screen.png", "image/png"],
		["notes.txt", "text/plain"],
	]);
	const [image, notes] = draft.files;
	if (!image || !notes) throw new Error("Missing restored files");
	expect(new Uint8Array(await image.arrayBuffer())).toEqual(
		new Uint8Array([0, 255, 1]),
	);
	expect(await notes.text()).toBe("notes");
});

test("a missing attachment fails before returning a partial editable draft", async () => {
	await expect(
		forkQueuedDraft(prompt, {
			workspace: async () => {
				throw new Error("File missing");
			},
			stored: async (attachment) => new File(["notes"], attachment.name),
		}),
	).rejects.toThrow("File missing");
});
