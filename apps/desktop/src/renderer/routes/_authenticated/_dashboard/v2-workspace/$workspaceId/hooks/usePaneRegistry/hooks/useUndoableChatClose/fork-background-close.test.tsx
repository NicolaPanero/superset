import { afterEach, expect, mock, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import { WorkspaceClientProvider } from "@superset/workspace-client";
import type { ReactNode } from "react";
import { useUndoStack } from "renderer/stores/undo-stack";
import { act, flush, renderHook } from "renderer/test-utils/fork-ui";
import type { PaneViewerData } from "../../../../types";
import { readPendingChatStops } from "../../../../utils/pendingChatStops";
import { useUndoableChatClose } from "./useUndoableChatClose";

let next = 0;
const realFetch = globalThis.fetch;
const requests: string[] = [];
afterEach(() => {
	useUndoStack.setState({ entries: [] });
	globalThis.fetch = realFetch;
	requests.length = 0;
});
/** Stopping a chat is a request to the host's chat router. */
const chatStops = () => requests.filter((url) => url.includes("/chat-v3/"));
function fixture() {
	const sessionId = `background-close-${++next}`;
	const store = createWorkspaceStore<PaneViewerData>();
	store.getState().addTab({
		id: sessionId,
		panes: [
			{
				kind: "chat-v3",
				data: { terminalId: sessionId, sessionId, agent: { id: "claude" } },
			},
		],
	});
	const pane = Object.values(store.getState().tabs[0]?.panes ?? {})[0];
	if (!pane) throw new Error("Missing chat pane");
	const park = mock(async (_pane: typeof pane) => {});
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		requests.push(String(input));
		return new Response("[]");
	}) as typeof fetch;
	const hook = renderHook(
		() =>
			useUndoableChatClose({
				workspaceId: sessionId,
				store,
				onExpire: park,
			}),
		{
			wrapper: ({ children }: { children: ReactNode }) => (
				<WorkspaceClientProvider
					cacheKey={sessionId}
					hostUrl="http://127.0.0.1:9"
				>
					{children}
				</WorkspaceClientProvider>
			),
		},
	);
	act(() => {
		store.getState().removeTab(sessionId);
		hook.result.current(pane);
	});
	return { sessionId, store, pane, park, hook };
}

test("closing a fork chat and leaving the workspace parks the running session without stopping it", async () => {
	const f = fixture();
	expect(readPendingChatStops(f.sessionId)).toEqual([]);
	f.hook.unmount();
	await flush();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(f.park).toHaveBeenCalledWith(f.pane);
	expect(chatStops()).toEqual([]);
	expect(f.store.getState().tabs).toHaveLength(0);
});

test("Undo restores a closed fork chat without parking or stopping the running session", async () => {
	const f = fixture();
	act(() => useUndoStack.getState().undoLatest());
	expect(f.store.getState().tabs[0]?.panes[f.pane.id]?.data).toEqual(
		f.pane.data,
	);
	f.hook.unmount();
	await flush();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(f.park).not.toHaveBeenCalled();
	expect(chatStops()).toEqual([]);
});
