import {
	type HandoffBlock,
	type HandoffMessage,
	type HandoffPage,
	renderHandoffPage,
} from "./fork-context-handoff";
import type { LocalLineageStore } from "./lineage";
import type { EarlierHistory, TxcriptTransferProvider } from "./txcript";

/** Each page is one helper run that parses the whole session again. */
export const HANDOFF_MAX_HISTORY_PAGES = 8;
/** Read at the start of a long session to find the original request. */
const SESSION_START_MESSAGES = 50;

export type HistoryPageReader = (before?: number) => Promise<EarlierHistory>;

export function toHandoffMessages(
	page: EarlierHistory["messages"],
): HandoffMessage[] {
	return page.map((message, position) => ({
		index: message.index ?? position,
		role: message.role,
		blocks: message.blocks.map(
			(block): HandoffBlock =>
				block.type === "image"
					? { type: "image", mediaType: block.mediaType }
					: block.type === "tool"
						? {
								type: "tool",
								name: block.name,
								input: block.input,
								output: block.output,
								isError: block.isError,
							}
						: block,
		),
	}));
}

/**
 * The session newest page first, oldest message first in the result. A
 * session longer than the page limit keeps its start and drops the middle.
 */
export async function readHandoffHistory(
	read: HistoryPageReader,
	maxPages = HANDOFF_MAX_HISTORY_PAGES,
): Promise<{ messages: HandoffMessage[]; omittedUnknown: boolean }> {
	let messages: HandoffMessage[] = [];
	let before: number | undefined;
	for (let pages = 0; pages < maxPages; pages++) {
		const page = await read(before);
		messages = [...toHandoffMessages(page.messages), ...messages];
		const next = page.nextBefore ?? null;
		if (next === null || page.messages.length === 0)
			return { messages, omittedUnknown: false };
		if (before !== undefined && next >= before)
			throw new Error("invalid_history_cursor");
		before = next;
	}
	if (before === undefined) return { messages, omittedUnknown: false };
	const start = await read(Math.min(SESSION_START_MESSAGES, before));
	return {
		messages: [...toHandoffMessages(start.messages), ...messages],
		omittedUnknown:
			SESSION_START_MESSAGES < before || (start.nextBefore ?? null) !== null,
	};
}

export type HistoryRequest = Parameters<TxcriptTransferProvider["history"]>[0];

/**
 * One page of a session a context handoff recorded. Any other session id,
 * workspace or organization finds no node and reads nothing.
 */
export async function readHandoffSourcePage(input: {
	lineage: Pick<LocalLineageStore, "node">;
	history: (request: HistoryRequest) => Promise<EarlierHistory>;
	workspaceId: string;
	sourceNodeId: string;
	before?: number;
}): Promise<HandoffPage> {
	const node = input.lineage.node(input.workspaceId, input.sourceNodeId);
	if (!node) throw new Error("handoff_source_unavailable");
	const page = await input.history({
		sourceAgent: node.agent,
		sourceSessionId: node.sessionId,
		sourceRoot: node.storeRoot,
		sourceReference: node.reference,
		all: true,
		...(input.before !== undefined ? { before: input.before } : {}),
	});
	return renderHandoffPage({
		messages: toHandoffMessages(page.messages),
		nextBefore: page.nextBefore ?? null,
		agentLabel: node.label,
	});
}
