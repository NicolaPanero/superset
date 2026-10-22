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
	expect(view.queryByRole("menuitem", { name: /^Plan/ })).toBeNull();
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

test("an advertised Plan mode is selectable beside permissions and shown in the composer", async () => {
	let selected: string | undefined;
	const view = render(
		<ModePicker
			currentModeId={FULL_ACCESS_CHAT_MODE}
			modes={[
				{ id: "default", label: "Default" },
				{ id: "plan", label: "Plan" },
				{ id: FULL_ACCESS_CHAT_MODE, label: "Full access" },
			]}
			onSelect={(id) => {
				selected = id;
			}}
		/>,
	);
	fireEvent.keyDown(view.getByRole("button", { name: "Full access" }), {
		key: "ArrowDown",
		code: "ArrowDown",
	});
	await flush();
	const plan = view.getByRole("menuitem", {
		name: /Plan Plan with full access; tool actions are approved automatically\./,
	});
	fireEvent.click(plan);
	await flush();
	expect(selected).toBe("plan");
	expect(view.getByRole("button", { name: "Plan" })).toBeDefined();
});

test("the picker is available when Plan is the only alternative to the current mode", () => {
	const view = render(
		<ModePicker
			currentModeId="plan"
			modes={[
				{ id: "default", label: "Default" },
				{ id: "plan", label: "Plan" },
			]}
			onSelect={() => {}}
		/>,
	);
	expect(view.getByRole("button", { name: "Plan" })).toBeDefined();
});

test("Cursor modes have descriptions and run from read-only Ask to Full access regardless of provider order", async () => {
	const view = render(
		<ModePicker
			currentModeId={FULL_ACCESS_CHAT_MODE}
			modes={[
				{ id: "agent", label: "Agent" },
				{ id: "plan", label: "Plan" },
				{ id: "ask", label: "Ask" },
				{ id: FULL_ACCESS_CHAT_MODE, label: "Full access" },
				{ id: "default", label: "Default" },
			]}
			onSelect={() => {}}
		/>,
	);
	fireEvent.keyDown(view.getByRole("button", { name: "Full access" }), {
		key: "ArrowDown",
		code: "ArrowDown",
	});
	await flush();
	expect(view.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(
		[
			"AskExplore code and answer questions without making changes.",
			"PlanPlan with full access; tool actions are approved automatically.",
			"Ask for approvalAsks before edits and commands",
			"Approve for meAsks only for risky actions",
			"Full accessApproves tool actions automatically in this chat.",
		],
	);
});
