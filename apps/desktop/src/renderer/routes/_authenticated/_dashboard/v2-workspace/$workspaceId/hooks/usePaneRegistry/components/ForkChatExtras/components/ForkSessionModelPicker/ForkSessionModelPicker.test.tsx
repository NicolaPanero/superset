import { afterEach, expect, mock, test } from "bun:test";
import type { SessionConfigOption } from "@superset/chat/protocol";
import { getAgentModelSupport } from "@superset/shared/agent-models";
import {
	act,
	cleanup,
	fireEvent,
	flush,
	render,
} from "renderer/test-utils/fork-ui";
import type { TerminalPaneData } from "../../../../../../types";
import { ForkSessionModelPicker } from "./ForkSessionModelPicker";

afterEach(cleanup);

const configs = [
	{ id: "claude", label: "Claude", presetId: "claude" },
	{ id: "codex", label: "Codex", presetId: "codex" },
	{ id: "grok", label: "Grok", presetId: "grok" },
];
const data = {
	terminalId: "terminal-1",
	agentSurface: "acp",
	agent: { id: "claude", sessionId: "session-1" },
} as TerminalPaneData;
const live: SessionConfigOption[] = [
	{
		id: "model",
		label: "Model",
		category: "model",
		currentValue: "opus",
		options: [
			{ id: "opus", label: "Opus" },
			{ id: "sonnet", label: "Sonnet" },
		],
	},
];

function row(view: ReturnType<typeof render>, label: string) {
	const found = view
		.getAllByRole("menuitem")
		.find((item) => item.textContent?.startsWith(label));
	if (!found) throw new Error(`no row ${label}`);
	return found;
}

async function switchAndClose(view: ReturnType<typeof render>) {
	fireEvent.click(view.getByRole("menuitem", { name: "Switch…" }));
	await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
	await flush();
}

async function openPicker(view: ReturnType<typeof render>) {
	fireEvent.keyDown(view.getByRole("button", { name: /Opus/ }), {
		key: "ArrowDown",
		code: "ArrowDown",
	});
	await flush();
}

test("another agent's model stays a draft until Switch asks to confirm", async () => {
	const onSelect = mock();
	const onRequestSwitch = mock();
	const view = render(
		<ForkSessionModelPicker
			configs={configs}
			data={data}
			configOptions={live}
			onSelect={onSelect}
			onRequestSwitch={onRequestSwitch}
		/>,
	);
	await openPicker(view);
	fireEvent.click(view.getByLabelText("Codex"));
	await flush();
	const codexModel = getAgentModelSupport("codex")?.models[0];
	if (!codexModel) throw new Error("Codex has no catalog model");
	fireEvent.click(row(view, codexModel.label));
	await flush();

	expect(view.queryByRole("menu")).not.toBeNull();
	expect(view.getByText(`Codex · ${codexModel.label}`)).toBeTruthy();
	expect(onSelect).not.toHaveBeenCalled();

	await switchAndClose(view);
	expect(onRequestSwitch).toHaveBeenCalledWith({
		configId: "codex",
		model: { id: codexModel.id, label: codexModel.label },
		effort: null,
	});
});

test("the chat's own agent applies a model at once", async () => {
	const onSelect = mock();
	const view = render(
		<ForkSessionModelPicker
			configs={configs}
			data={data}
			configOptions={live}
			onSelect={onSelect}
			onRequestSwitch={() => {}}
		/>,
	);
	await openPicker(view);
	fireEvent.click(row(view, "Sonnet"));
	await flush();
	expect(onSelect).toHaveBeenCalledWith("model", "sonnet");
	expect(view.queryByRole("menuitem", { name: "Switch…" })).toBeNull();
});

test("a browsed Grok tab offers the efforts of the picked model", async () => {
	const onRequestSwitch = mock();
	const view = render(
		<ForkSessionModelPicker
			configs={configs}
			data={data}
			configOptions={live}
			onRequestSwitch={onRequestSwitch}
		/>,
	);
	await openPicker(view);
	fireEvent.click(view.getByLabelText("Grok"));
	await flush();
	fireEvent.click(row(view, "Grok 4.7"));
	await flush();
	fireEvent.keyDown(view.getByRole("slider"), {
		key: "End",
	});
	await flush();
	expect(view.getByText("Grok · Grok 4.7 · xHigh")).toBeTruthy();
	await switchAndClose(view);
	expect(onRequestSwitch).toHaveBeenCalledWith({
		configId: "grok",
		model: { id: "grok-4.7", label: "Grok 4.7" },
		effort: { id: "xhigh", label: "xHigh" },
	});
});

test("Switch asks for the dialog only after the menu has closed", async () => {
	const menuOpenAtRequest: boolean[] = [];
	const view = render(
		<ForkSessionModelPicker
			configs={configs}
			data={data}
			configOptions={live}
			onRequestSwitch={() =>
				menuOpenAtRequest.push(view.queryByRole("menu") !== null)
			}
		/>,
	);
	await openPicker(view);
	fireEvent.click(view.getByLabelText("Codex"));
	await flush();
	await switchAndClose(view);
	expect(menuOpenAtRequest).toEqual([false]);
});
