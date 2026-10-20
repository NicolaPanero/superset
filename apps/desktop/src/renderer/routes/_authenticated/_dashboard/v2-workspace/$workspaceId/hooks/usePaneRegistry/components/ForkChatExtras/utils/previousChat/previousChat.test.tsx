import { afterEach, expect, test } from "bun:test";
import { act, cleanup, render } from "renderer/test-utils/fork-ui";
import type { TerminalPaneData } from "../../../../../../types";
import {
	forgetPreviousChat,
	rememberPreviousChat,
	usePreviousChat,
} from "./previousChat";

afterEach(cleanup);

function Probe({ terminalId }: { terminalId: string }) {
	const previous = usePreviousChat(terminalId);
	return (
		<span>
			{previous
				? `${previous.label}:${previous.data.agent?.sessionId}`
				: "none"}
		</span>
	);
}

test("a switched pane keeps its source chat, resumable and without the closed session", () => {
	const source = {
		terminalId: "pane-1",
		agentSurface: "acp",
		agent: { id: "grok", sessionId: "grok-session" },
		acpSessionId: "closed-chat",
		pendingPrompt: "sent already",
	} as TerminalPaneData;
	const view = render(<Probe terminalId="pane-1" />);
	expect(view.container.textContent).toBe("none");
	act(() => rememberPreviousChat(source, "Grok", false));
	expect(view.container.textContent).toBe("Grok:grok-session");
	act(() => forgetPreviousChat("pane-1"));
	expect(view.container.textContent).toBe("none");
});

test("the stored copy drops the chat session and unsent prompt", () => {
	rememberPreviousChat(
		{
			terminalId: "pane-2",
			agent: { id: "grok", sessionId: "s" },
			acpSessionId: "closed-chat",
			pendingPrompt: "x",
		} as TerminalPaneData,
		"Grok",
		true,
	);
	let stored: ReturnType<typeof usePreviousChat>;
	function Read() {
		stored = usePreviousChat("pane-2");
		return null;
	}
	render(<Read />);
	expect(stored).toMatchObject({ label: "Grok", summaryOnly: true });
	expect(stored?.data).not.toHaveProperty("acpSessionId");
	expect(stored?.data).not.toHaveProperty("pendingPrompt");
	forgetPreviousChat("pane-2");
});
