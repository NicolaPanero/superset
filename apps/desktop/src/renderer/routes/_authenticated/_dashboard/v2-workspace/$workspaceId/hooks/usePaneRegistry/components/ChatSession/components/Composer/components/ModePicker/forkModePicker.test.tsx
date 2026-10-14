import { expect, test } from "bun:test";
import { FULL_ACCESS_CHAT_MODE } from "@superset/chat/protocol";
import { fireEvent, flush, render } from "renderer/test-utils/fork-ui";
import { ModePicker } from "./ModePicker";

test("Cursor's menu offers Full access alongside Agent and Ask", async () => {
	let selected: string | undefined;
	const view = render(
		<ModePicker
			currentModeId="agent"
			modes={[
				{ id: "agent", label: "Agent" },
				{ id: "ask", label: "Ask" },
				{ id: FULL_ACCESS_CHAT_MODE, label: "Full access" },
			]}
			onSelect={(id) => {
				selected = id;
			}}
		/>,
	);
	fireEvent.keyDown(view.getByRole("button", { name: "Approve for me" }), {
		key: "ArrowDown",
		code: "ArrowDown",
	});
	await flush();
	const full = view.getByRole("menuitem", { name: /Full access/ });
	fireEvent.focus(full);
	await flush();
	expect(
		view.getByText("Approves tool actions automatically in this chat."),
	).toBeDefined();
	fireEvent.click(full);
	await flush();
	expect(selected).toBe(FULL_ACCESS_CHAT_MODE);
});
test("a restored Full access choice is clearly shown in the composer", () => {
	const view = render(
		<ModePicker
			currentModeId={FULL_ACCESS_CHAT_MODE}
			modes={[
				{ id: "agent", label: "Agent" },
				{ id: FULL_ACCESS_CHAT_MODE, label: "Full access" },
			]}
			onSelect={() => {}}
		/>,
	);
	expect(view.getByRole("button", { name: "Full access" })).toBeDefined();
});
test("a native YOLO mode has the same Full access label", () => {
	const view = render(
		<ModePicker
			currentModeId="yolo"
			modes={[
				{ id: "default", label: "Default" },
				{ id: "yolo", label: "YOLO" },
			]}
			onSelect={() => {}}
		/>,
	);
	expect(view.getByRole("button", { name: "Full access" })).toBeDefined();
});
