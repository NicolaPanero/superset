import { expect, test } from "bun:test";
import type { SessionConfigOption } from "@superset/chat/protocol";
import { pendingModelResetChange } from "./pendingModelReset";

const model = (currentValue: string): SessionConfigOption => ({
	id: "model",
	label: "Model",
	category: "model",
	currentValue,
	options: [
		{ id: "default", label: "Default (recommended)" },
		{ id: "opus", label: "Opus" },
	],
});

test("a source agent's model in a switched chat falls back to the default model", () => {
	expect(pendingModelResetChange([model("gpt-5.5")])).toEqual({
		configId: "model",
		value: "default",
	});
	expect(pendingModelResetChange([model("opus")])).toBeNull();
	expect(pendingModelResetChange([])).toBeNull();
});
