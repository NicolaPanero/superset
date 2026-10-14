import { expect, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { resolveAgentSessionTitles } from "./resolveAgentSessionTitles";

test("sessions from the same agent keep separate titles, including background chats and terminals", () => {
	const store = createWorkspaceStore<PaneViewerData>();
	store.getState().addTab({
		panes: [
			{
				kind: "chat-v3",
				titleOverride: "Claude",
				data: {
					terminalId: "claude-1",
					sessionId: "chat-1",
					chatTitle: "Fix agent modal",
				},
			},
		],
	});
	const titles = resolveAgentSessionTitles({
		layouts: [store.getState()],
		terminalTitles: new Map([["codex-terminal", "Review changes"]]),
		sessions: [
			{ terminalId: "claude-1", title: null },
			{ terminalId: "claude-2", title: "Polish sidebar" },
		],
		agents: [
			{ terminalId: "claude-1", label: "Claude" },
			{ terminalId: "claude-2", label: "Claude" },
			{ terminalId: "codex-terminal", label: "Codex" },
		],
	});
	expect(Object.fromEntries(titles)).toEqual({
		"claude-1": "Fix agent modal",
		"claude-2": "Polish sidebar",
		"codex-terminal": "Review changes",
	});
});

test("manual tab and pane titles take precedence across both pane areas without renaming sibling sessions", () => {
	const center = createWorkspaceStore<PaneViewerData>();
	center.getState().addTab({
		titleOverride: "My active review",
		panes: [
			{
				id: "first",
				kind: "chat-v3",
				data: { terminalId: "one", sessionId: "chat-one", chatTitle: "First" },
			},
			{
				id: "second",
				kind: "chat-v3",
				data: { terminalId: "two", sessionId: "chat-two", chatTitle: "Second" },
			},
		],
	});
	const tab = center.getState().tabs[0];
	center.getState().setActivePane({ tabId: tab.id, paneId: "first" });
	const right = createWorkspaceStore<PaneViewerData>();
	right.getState().addTab({
		panes: [
			{
				kind: "terminal",
				titleOverride: "My terminal review",
				data: { terminalId: "three" },
			},
		],
	});
	const titles = resolveAgentSessionTitles({
		layouts: [center.getState(), right.getState()],
		terminalTitles: new Map([["three", "Generated title"]]),
		sessions: [],
		agents: [],
	});
	expect(Object.fromEntries(titles)).toEqual({
		one: "My active review",
		two: "Second",
		three: "My terminal review",
	});
});

test("unnamed sessions keep the agent fallback and ignore empty or unbound host titles", () => {
	const titles = resolveAgentSessionTitles({
		layouts: [undefined],
		terminalTitles: new Map([["new-terminal", "  "]]),
		sessions: [
			{ terminalId: "new-chat", title: null },
			{ terminalId: null, title: "Old closed chat" },
		],
		agents: [],
	});
	expect(titles.size).toBe(0);
});
