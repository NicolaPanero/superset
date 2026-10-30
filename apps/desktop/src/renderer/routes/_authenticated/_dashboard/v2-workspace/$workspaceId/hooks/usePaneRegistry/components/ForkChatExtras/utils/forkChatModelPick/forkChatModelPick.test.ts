import { expect, test } from "bun:test";
import type { SessionConfigOption } from "@superset/chat/protocol";
import type { TerminalPaneData } from "../../../../../../types";
import { forkChatModelPick } from "./forkChatModelPick";

const options: SessionConfigOption[] = [
	{
		id: "model",
		label: "Model",
		category: "model",
		currentValue: "auto",
		options: [
			{ id: "auto", label: "Auto" },
			{ id: "claude-sonnet-5-5", label: "Sonnet 5.5" },
		],
	},
	{
		id: "mode",
		label: "Mode",
		category: "mode",
		currentValue: "agent",
		options: [{ id: "agent", label: "Agent" }],
	},
];
const data = {
	terminalId: "t1",
	agent: { id: "cursor-agent" },
} as TerminalPaneData;

test("a model picked in the chat is stored in the pane data with its label", () => {
	expect(
		forkChatModelPick(data, options, "model", "claude-sonnet-5-5"),
	).toEqual({
		...data,
		chatModelId: "claude-sonnet-5-5",
		chatModelLabel: "Sonnet 5.5",
	});
});

test("only a model choice is stored, and only a choice the session lists", () => {
	expect(forkChatModelPick(data, options, "mode", "agent")).toBeNull();
	expect(forkChatModelPick(data, options, "model", "unknown")).toBeNull();
	expect(forkChatModelPick(data, [], "model", "auto")).toBeNull();
});

test("picking Auto on purpose is kept too, and the same pick twice changes nothing", () => {
	const auto = forkChatModelPick(data, options, "model", "auto");
	expect(auto?.chatModelId).toBe("auto");
	expect(auto && forkChatModelPick(auto, options, "model", "auto")).toBeNull();
});
