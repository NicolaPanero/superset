import { expect, test } from "bun:test";
import type { SessionConfigOption } from "@superset/chat/protocol";
import { pendingEffortChange } from "./pendingEffort";

const effort: SessionConfigOption = {
	id: "thought_level",
	label: "Effort",
	category: "thought_level",
	currentValue: "medium",
	options: [
		{ id: "medium", label: "Medium" },
		{ id: "high", label: "High" },
	],
};

test("a picked effort applies only when the new session offers it", () => {
	expect(pendingEffortChange([effort], "high")).toEqual({
		configId: "thought_level",
		value: "high",
	});
	expect(pendingEffortChange([effort], "medium")).toBeNull();
	expect(pendingEffortChange([effort], "max")).toBeNull();
	expect(pendingEffortChange([], "high")).toBeNull();
});
