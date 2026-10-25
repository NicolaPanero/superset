import type { UserMessage } from "@superset/chat/protocol";
import { MAX_ATTACHMENT_BYTES } from "@superset/shared/attachment-limits";
import { workspaceTrpc } from "@superset/workspace-client";
import { type RefObject, useCallback, useRef } from "react";
import type { ComposerHandle } from "../../../Composer";
import type { DrawerQueue } from "../../types";
import { forkQueuedDraft, forkQueuedFile } from "./utils/forkQueuedDraft";

export type ForkQueuedEdit = (
	prompt: UserMessage,
	run: (action: () => Promise<void>) => Promise<boolean>,
) => Promise<void>;

/**
 * Editing a queued prompt brings its attachments back as files, not only its
 * text. The prompt leaves the queue only after every file has loaded, and
 * stays queued if the composer closed in the meantime.
 */
export function useForkQueuedEdit({
	promptQueue,
	composerRef,
	workspaceId,
}: {
	promptQueue: DrawerQueue | undefined;
	composerRef: RefObject<ComposerHandle | null>;
	workspaceId: string;
}): ForkQueuedEdit {
	const utils = workspaceTrpc.useUtils();
	const editing = useRef(new Set<string>());
	return useCallback(
		async (prompt, run) => {
			if (
				!promptQueue ||
				!composerRef.current ||
				editing.current.has(prompt.id)
			)
				return;
			editing.current.add(prompt.id);
			try {
				await run(async () => {
					const draft = await forkQueuedDraft(prompt, {
						workspace: async (attachment) => {
							const workspace = await utils.workspace.get.fetch({
								id: workspaceId,
							});
							if (!workspace?.worktreePath)
								throw new Error("Workspace is not ready");
							const file = await utils.filesystem.readFile.fetch({
								workspaceId,
								absolutePath: `${workspace.worktreePath}/${attachment.path}`,
								maxBytes: MAX_ATTACHMENT_BYTES,
							});
							if (file.exceededLimit)
								throw new Error("Attachment exceeds the file size limit");
							return forkQueuedFile(
								file.content,
								attachment.path.split("/").pop() ?? attachment.path,
								attachment.type,
							);
						},
						stored: async (attachment) => {
							const file = await utils.attachments.read.fetch({
								attachmentId: attachment.attachmentId,
							});
							return forkQueuedFile(file.data, attachment.name, file.mediaType);
						},
					});
					const composer = composerRef.current;
					if (!composer) return;
					await promptQueue.remove(prompt.id);
					composer.addFiles(draft.files);
					composer.appendText(draft.text);
				});
			} finally {
				editing.current.delete(prompt.id);
			}
		},
		[promptQueue, composerRef, utils, workspaceId],
	);
}
