import { useLingui } from "@lingui/react/macro";
import type { OutboxEntry } from "@superset/chat/core";
import type { AvailableCommand, UserContent } from "@superset/chat/protocol";
import {
	PromptInput,
	PromptInputFooter,
	type PromptInputMessage,
	PromptInputProvider,
	PromptInputSubmit,
	usePromptInputController,
} from "@superset/ui/ai-elements/prompt-input";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { ArrowUpIcon, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { TiptapPromptEditor } from "renderer/components/TiptapPromptEditor";
import type { SlashCommand } from "renderer/components/TiptapPromptEditor/slash-commands";

const DRAFT_DEBOUNCE_MS = 300;

export type ComposerProps = {
	workspaceId: string;
	draftKey: string;
	availableCommands: AvailableCommand[];
	onSend: (content: UserContent[]) => OutboxEntry | null;
	placeholder?: string;
	disabled?: boolean;
	onCancelTurn?: (() => void) | null;
};

/**
 * What the agent reported over ACP, in the shape the shared `/` menu takes.
 * Everything the agent offers is harness-provided, so provenance is fixed.
 */
function toMenuCommands(commands: AvailableCommand[]): SlashCommand[] {
	return commands.map((command) => ({
		name: command.name,
		aliases: [],
		description: command.description ?? "",
		argumentHint: command.hint ?? "",
		kind: "builtin" as const,
		source: "harness" as const,
		entryKind: "command" as const,
		trigger: "/" as const,
	}));
}

export function Composer(props: ComposerProps) {
	return (
		<PromptInputProvider
			initialInput={window.localStorage.getItem(props.draftKey) ?? ""}
			key={props.draftKey}
		>
			<ComposerInner {...props} />
		</PromptInputProvider>
	);
}

function ComposerInner({
	availableCommands,
	disabled,
	draftKey,
	onCancelTurn,
	onSend,
	placeholder,
	workspaceId,
}: ComposerProps) {
	const { t } = useLingui();
	const controller = usePromptInputController();
	const trpcUtils = workspaceTrpc.useUtils();

	// Deduped with the page-level workspace.get query; gives the mention popover
	// the cwd it shortens paths against.
	const { data: workspaceStatus } = workspaceTrpc.workspace.get.useQuery(
		{ id: workspaceId },
		{ refetchOnWindowFocus: false },
	);
	const cwd = workspaceStatus?.worktreePath ?? "";

	const searchFiles = useCallback(
		async (query: string) => {
			const { matches } = await trpcUtils.filesystem.searchFiles.fetch({
				workspaceId,
				query,
				includeHidden: false,
				limit: 20,
			});
			return matches.map((match) => ({
				id: match.absolutePath,
				name: match.name,
				relativePath: match.relativePath,
			}));
		},
		[trpcUtils, workspaceId],
	);

	const slashCommands = useMemo(
		() => toMenuCommands(availableCommands),
		[availableCommands],
	);

	const text = controller.textInput.value;
	const textRef = useRef(text);
	textRef.current = text;
	useEffect(() => {
		const timer = setTimeout(() => {
			if (text === "") window.localStorage.removeItem(draftKey);
			else window.localStorage.setItem(draftKey, text);
		}, DRAFT_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [text, draftKey]);

	useEffect(() => {
		return () => {
			const latest = textRef.current;
			if (latest === "") window.localStorage.removeItem(draftKey);
			else window.localStorage.setItem(draftKey, latest);
		};
	}, [draftKey]);

	const handleSubmit = useCallback(
		(message: PromptInputMessage) => {
			if (message.text.trim() === "") return;
			// PromptInput empties the composer before calling this and puts it
			// back only when the handler fails, so refusing quietly would throw
			// the draft away while the session is still coming up.
			if (disabled) {
				controller.textInput.setInput(message.text);
				return;
			}
			onSend([{ type: "text", text: message.text }]);
			controller.textInput.clear();
			window.localStorage.removeItem(draftKey);
		},
		[disabled, onSend, controller, draftKey],
	);

	return (
		<div className="px-6 pt-1 pb-5">
			<PromptInput
				className={cn(
					"mx-auto w-full max-w-3xl rounded-2xl bg-card shadow-sm",
					"[&>[data-slot=input-group]]:rounded-2xl [&>[data-slot=input-group]]:border-border [&>[data-slot=input-group]]:shadow-none",
				)}
				onSubmit={handleSubmit}
			>
				<TiptapPromptEditor
					cwd={cwd}
					placeholder={
						placeholder ??
						t({ message: "Ask the agent, @mention files, run /commands" })
					}
					searchFiles={searchFiles}
					slashCommands={slashCommands}
				/>
				<PromptInputFooter>
					<span />
					{onCancelTurn ? (
						<Button
							className="size-7 rounded-full"
							onClick={onCancelTurn}
							size="icon"
							type="button"
							variant="outline"
						>
							<Square className="size-3.5" />
						</Button>
					) : (
						<PromptInputSubmit
							disabled={disabled}
							className="size-7 rounded-full border border-transparent bg-foreground/10 p-[5px] shadow-none hover:bg-foreground/20"
						>
							<ArrowUpIcon className="size-3.5 text-muted-foreground" />
						</PromptInputSubmit>
					)}
				</PromptInputFooter>
			</PromptInput>
		</div>
	);
}
