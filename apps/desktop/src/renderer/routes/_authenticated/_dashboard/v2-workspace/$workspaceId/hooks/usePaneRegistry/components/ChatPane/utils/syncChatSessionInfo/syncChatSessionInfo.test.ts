import { expect, test } from "bun:test";
import { createWorkspaceStore, type RendererContext } from "@superset/panes";
import type {
	ChatPaneData,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { syncChatSessionInfo } from "./syncChatSessionInfo";

function fixture(titleOverride = "Claude") {
	const store = createWorkspaceStore<PaneViewerData>();
	store.getState().addTab({
		panes: [
			{
				id: "agent",
				kind: "chat-v3",
				titleOverride,
				data: {
					terminalId: "terminal",
					sessionId: "chat-session",
					agent: { id: "claude" },
				} satisfies ChatPaneData,
			},
		],
	});
	const tab = store.getState().tabs[0];
	const ctx = {
		store,
		pane: tab.panes.agent,
		tab,
	} as RendererContext<PaneViewerData>;
	return { store, ctx, pane: () => store.getState().tabs[0].panes.agent };
}

test("a conversation title retires the stored agent label and keeps current pane data", () => {
	const { ctx, store, pane } = fixture();
	store.getState().setPaneData({
		paneId: "agent",
		data: { ...pane().data, chatModeId: "full-access" },
	});
	syncChatSessionInfo(
		ctx,
		{ harnessSessionId: "native-session", title: "Fix agent tabs" },
		"Claude",
	);
	expect(pane().titleOverride).toBeUndefined();
	expect(pane().data).toMatchObject({
		chatTitle: "Fix agent tabs",
		chatModeId: "full-access",
		sessionId: "chat-session",
		agent: { id: "claude", sessionId: "native-session" },
	});
	syncChatSessionInfo(ctx, { title: "Agent tab naming and icons" }, "Claude");
	expect((pane().data as ChatPaneData).chatTitle).toBe(
		"Agent tab naming and icons",
	);
});

test("a custom pane and tab name survive automatic session titles", () => {
	const { ctx, store, pane } = fixture("My review agent");
	store.getState().setTabTitleOverride({
		tabId: ctx.tab.id,
		titleOverride: "Release review",
	});
	syncChatSessionInfo(ctx, { title: "Review changed files" }, "Claude");
	expect(pane().titleOverride).toBe("My review agent");
	expect(store.getState().tabs[0].titleOverride).toBe("Release review");
	expect((pane().data as ChatPaneData).chatTitle).toBe("Review changed files");
});

test("reopening a named conversation removes a legacy agent label without a new title event", () => {
	const { ctx, store, pane } = fixture("Custom Claude");
	store.getState().setPaneData({
		paneId: "agent",
		data: { ...pane().data, chatTitle: "Repair login" },
	});
	syncChatSessionInfo(ctx, {}, "Custom Claude");
	expect(pane().titleOverride).toBeUndefined();
	expect((pane().data as ChatPaneData).chatTitle).toBe("Repair login");
});
