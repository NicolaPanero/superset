import type { SessionSnapshot } from "@superset/chat/core";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useMemo, useState } from "react";
import {
	type EarlierMessage,
	earlierHistory,
} from "../../utils/earlierHistory";

export type EarlierMessages = {
	/** The chat was converted from another one and more of its earlier messages can be shown. */
	available: boolean;
	loading: boolean;
	failed: boolean;
	show: () => void;
	withEarlier: (snapshot: SessionSnapshot) => SessionSnapshot;
};

/** Pages back through the chat an imported one was converted from. */
export function useEarlierMessages(
	workspaceId: string,
	sessionId: string | undefined,
): EarlierMessages {
	const utils = workspaceTrpc.useUtils();
	const exists = workspaceTrpc.sessionTransfer.hasEarlierMessages.useQuery(
		{ workspaceId, sessionId: sessionId ?? "" },
		{
			enabled: Boolean(sessionId),
			retry: false,
			staleTime: Number.POSITIVE_INFINITY,
		},
	);
	const [messages, setMessages] = useState<EarlierMessage[]>([]);
	const [nextBefore, setNextBefore] = useState<number | null | undefined>(
		undefined,
	);
	const [loading, setLoading] = useState(false);
	const [failed, setFailed] = useState(false);
	const show = useCallback(() => {
		if (!sessionId || loading || nextBefore === null) return;
		setLoading(true);
		setFailed(false);
		utils.sessionTransfer.earlierMessages
			.fetch(
				{
					workspaceId,
					sessionId,
					...(nextBefore !== undefined ? { before: nextBefore } : {}),
				},
				{ staleTime: Number.POSITIVE_INFINITY },
			)
			.then((page) => {
				if (!page || page.messages.length === 0) {
					setNextBefore(null);
					return;
				}
				setMessages((previous) => [...page.messages, ...previous]);
				setNextBefore(page.nextBefore ?? null);
			})
			.catch(() => setFailed(true))
			.finally(() => setLoading(false));
	}, [utils, workspaceId, sessionId, loading, nextBefore]);
	const parts = useMemo(
		() => (messages.length > 0 ? earlierHistory(messages) : null),
		[messages],
	);
	return useMemo(
		() => ({
			available: exists.data === true && nextBefore !== null,
			loading,
			failed,
			show,
			withEarlier: (snapshot) =>
				parts
					? {
							...snapshot,
							turns: new Map([...parts.turns, ...snapshot.turns]),
							items: new Map([...parts.items, ...snapshot.items]),
						}
					: snapshot,
		}),
		[exists.data, nextBefore, loading, failed, show, parts],
	);
}
