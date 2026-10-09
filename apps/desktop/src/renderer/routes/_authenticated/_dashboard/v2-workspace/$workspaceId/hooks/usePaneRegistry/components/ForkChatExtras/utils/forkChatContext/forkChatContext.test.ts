import { expect, mock, test } from "bun:test";
import type { RendererContext } from "@superset/panes";
import type { PaneViewerData } from "../../../../../../types";
import { forkChatContext } from "./forkChatContext";

test("fork adapters preserve official runtime identity on ordinary updates and clear it on handoff", () => {
	const updateData = mock((_data: PaneViewerData) => {});
	const ctx = {
		pane: {
			kind: "chat-v3",
			data: {
				terminalId: "terminal",
				sessionId: "runtime",
				acpAgentConfigId: "custom",
				acpAccountSelection: "/account",
			},
		},
		actions: { updateData },
	} as unknown as RendererContext<PaneViewerData>;
	const fork = forkChatContext(ctx);
	expect(fork.pane.data).toMatchObject({
		acpSessionId: "runtime",
		acpAccountSelection: "/account",
	});
	fork.actions.updateData({
		...fork.pane.data,
		acpSessionId: undefined,
	} as PaneViewerData);
	expect(updateData.mock.calls[0]?.[0]).toMatchObject({
		sessionId: null,
		acpAccountSelection: "/account",
		acpAgentConfigId: "custom",
	});
	fork.actions.updateData({ chatTitle: "Renamed" } as PaneViewerData);
	expect(updateData.mock.calls[1]?.[0]).toMatchObject({
		sessionId: "runtime",
		chatTitle: "Renamed",
	});
	expect(updateData.mock.calls[0]?.[0]).not.toHaveProperty("agentSurface");
	fork.actions.updateData({
		terminalId: "terminal",
		agent: { id: "codex", sessionId: "native" },
		acpAccountSelection: "/new",
	} as PaneViewerData);
	expect(updateData.mock.calls[2]?.[0]).toMatchObject({
		sessionId: null,
		agent: { id: "codex", sessionId: "native" },
		acpAccountSelection: "/new",
	});
});

test("terminal contexts pass through without a compatibility wrapper", () => {
	const ctx = { pane: { kind: "terminal" } } as RendererContext<PaneViewerData>;
	expect(forkChatContext(ctx)).toBe(ctx);
});
