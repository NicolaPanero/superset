import { afterEach, expect, mock, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import { useUndoStack } from "renderer/stores/undo-stack";
import { act, flush, renderHook } from "renderer/test-utils/fork-ui";
import type { PaneViewerData } from "../../../../types";
import { readPendingChatStops } from "../../../../utils/pendingChatStops";
import { useUndoableChatClose } from "./useUndoableChatClose";

let next = 0;
afterEach(() => useUndoStack.setState({ entries: [] }));
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
	const stopChat = mock(async () => true);
	const park = mock(async (_pane: typeof pane) => {});
	const hook = renderHook(() =>
		useUndoableChatClose({
			workspaceId: sessionId,
			store,
			stopChat,
			onExpire: park,
		}),
	);
	act(() => {
		store.getState().removeTab(sessionId);
		hook.result.current(pane);
	});
	return { sessionId, store, pane, stopChat, park, hook };
}

test("closing a fork chat and leaving the workspace parks the running session without stopping it", async () => {
	const f = fixture();
	expect(readPendingChatStops(f.sessionId)).toEqual([]);
	f.hook.unmount();
	await flush();
	expect(f.park).toHaveBeenCalledWith(f.pane);
	expect(f.stopChat).not.toHaveBeenCalled();
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
	expect(f.park).not.toHaveBeenCalled();
	expect(f.stopChat).not.toHaveBeenCalled();
});
