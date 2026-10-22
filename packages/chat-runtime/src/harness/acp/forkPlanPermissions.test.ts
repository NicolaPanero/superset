import { expect, test } from "bun:test";
import { forkPlanAllowOption } from "./forkPlanPermissions";

test("Plan approves tools but preserves decisions exposed through tool metadata", () => {
	const request = {
		sessionId: "session",
		options: [{ optionId: "once", name: "Allow", kind: "allow_once" }],
	};
	expect(forkPlanAllowOption(request)).toBe("once");
	for (const toolCall of [
		{ name: "ExitPlanMode" },
		{ title: "Exit plan mode" },
		{ name: "AskUserQuestion" },
		{ name: "request_user_input" },
		{ kind: "switch_mode" },
		{ _meta: { claudeCode: { toolName: "ExitPlanMode" } } },
	])
		expect(forkPlanAllowOption({ ...request, toolCall })).toBeUndefined();
	expect(forkPlanAllowOption(request, "ExitPlanMode")).toBeUndefined();
});
