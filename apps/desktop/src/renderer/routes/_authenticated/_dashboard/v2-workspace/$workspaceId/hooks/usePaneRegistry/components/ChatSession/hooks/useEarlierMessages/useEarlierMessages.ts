import type { SessionSnapshot } from "@superset/chat/core";
import { workspaceTrpc } from "@superset/workspace-client";
import { useMemo, useState } from "react";
import { earlierHistory } from "../../utils/earlierHistory";

export type EarlierMessages = {
	/** The chat was converted from another one and its earlier messages are not shown yet. */
	available: boolean;
	loading: boolean;
	failed: boolean;
	truncated: boolean;
	show: () => void;
	withEarlier: (snapshot: SessionSnapshot) => SessionSnapshot;
};

export function useEarlierMessages(
	workspaceId: string,
	sessionId: string | undefined,
): EarlierMessages {
	const [requested, setRequested] = useState(false);
	const input = { workspaceId, sessionId: sessionId ?? "" };
	const exists = workspaceTrpc.sessionTransfer.hasEarlierMessages.useQuery(
		input,
		{
			enabled: Boolean(sessionId),
			retry: false,
			staleTime: Number.POSITIVE_INFINITY,
		},
	);
	const history = workspaceTrpc.sessionTransfer.earlierMessages.useQuery(
		input,
		{
			enabled: requested && exists.data === true,
			retry: false,
			staleTime: Number.POSITIVE_INFINITY,
		},
	);
	const parts = useMemo(
		() => (history.data ? earlierHistory(history.data.messages) : null),
		[history.data],
	);
	return useMemo(
		() => ({
			available: exists.data === true && !parts,
			loading: requested && history.isFetching,
			failed: requested && history.isError,
			truncated: history.data?.truncated ?? false,
			show: () => {
				setRequested(true);
				if (history.isError) void history.refetch();
			},
			withEarlier: (snapshot) =>
				parts
					? {
							...snapshot,
							turns: new Map([...parts.turns, ...snapshot.turns]),
							items: new Map([...parts.items, ...snapshot.items]),
						}
					: snapshot,
		}),
		[exists.data, parts, requested, history],
	);
}
