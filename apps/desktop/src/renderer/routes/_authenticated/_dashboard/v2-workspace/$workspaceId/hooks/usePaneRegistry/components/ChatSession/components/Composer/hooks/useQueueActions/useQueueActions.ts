import { useLingui } from "@lingui/react/macro";
import type { UserMessage } from "@superset/chat/protocol";
import type { PromptInputHandle } from "@superset/chat-ui/PromptInput";
import { errorMessage, rawErrorMessage } from "@superset/i18n/errors";
import { MAX_ATTACHMENT_BYTES } from "@superset/shared/attachment-limits";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { type RefObject, useCallback, useRef } from "react";
import { forkDraftFiles } from "../../../../utils/forkDraftFiles";
import type { ComposerProps } from "../../Composer";
import { prependToDraft } from "../useComposerDraft";
import { forkQueuedDraft, forkQueuedFile } from "./utils/forkQueuedDraft";

const ALREADY_GONE = /is not queued$/;

export function useQueueActions(
	promptQueue: ComposerProps["promptQueue"],
	promptInputRef: RefObject<PromptInputHandle | null>,
	workspaceId: string,
	draftKey: string,
) {
	const { t } = useLingui();
	const utils = workspaceTrpc.useUtils();
	const editing = useRef(new Set<string>());

	const runQueueAction = useCallback(
		async (action: () => Promise<void>) => {
			try {
				await action();
				return true;
			} catch (error) {
				toast.error(t({ message: "Couldn't update the queue" }), {
					description: errorMessage(error, t({ message: "Unknown error" })),
				});
				return false;
			}
		},
		[t],
	);

	const editQueued = useCallback(
		async (prompt: UserMessage) => {
			if (
				!promptQueue ||
				!promptInputRef.current ||
				editing.current.has(prompt.id)
			)
				return;
			editing.current.add(prompt.id);
			try {
				await runQueueAction(async () => {
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
					if (!promptInputRef.current) return;
					await promptQueue.remove(prompt.id);
					if (promptInputRef.current) {
						promptInputRef.current.appendFiles(draft.files);
						promptInputRef.current.appendText(draft.text);
					} else {
						const files = forkDraftFiles(draftKey);
						files.onChange([...files.initial, ...draft.files]);
						prependToDraft(draftKey, [draft.text]);
					}
				});
			} finally {
				editing.current.delete(prompt.id);
			}
		},
		[promptQueue, runQueueAction, promptInputRef, utils, workspaceId, draftKey],
	);

	const clearQueued = useCallback(async () => {
		if (!promptQueue) return;
		await runQueueAction(async () => {
			const results = await Promise.allSettled(
				promptQueue.prompts.map((prompt) => promptQueue.remove(prompt.id)),
			);
			const failed = results.find(
				(result): result is PromiseRejectedResult =>
					result.status === "rejected" &&
					!ALREADY_GONE.test(rawErrorMessage(result.reason)),
			);
			if (failed) throw failed.reason;
		});
	}, [promptQueue, runQueueAction]);

	return {
		onClear: () => void clearQueued(),
		onEdit: (prompt: UserMessage) => void editQueued(prompt),
		onRemove: (id: string) => {
			if (promptQueue) void runQueueAction(() => promptQueue.remove(id));
		},
		onResume: () => {
			if (promptQueue) void runQueueAction(promptQueue.resume);
		},
		onSteer: (id: string) => {
			if (promptQueue) void runQueueAction(() => promptQueue.steer(id));
		},
	};
}
