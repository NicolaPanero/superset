import { expect, test } from "bun:test";
import {
	creationConfigOptions,
	fromOptionValue,
} from "./creationPickerOptions";

const labels = {
	model: "Model",
	effort: "Effort",
	defaultModel: "Default model",
	defaultEffort: "Default effort",
};

test("an unset or unknown choice shows as the agent default", () => {
	const [model, effort] = creationConfigOptions({
		models: [{ id: "opus", label: "Opus" }],
		selectedModel: "retired",
		efforts: [{ id: "high", label: "High" }],
		selectedEffort: null,
		labels,
	});
	expect(model?.category).toBe("model");
	expect(model?.options.map((option) => option.label)).toEqual([
		"Default model",
		"Opus",
	]);
	expect(fromOptionValue(model?.currentValue ?? "")).toBeNull();
	expect(effort?.category).toBe("thought_level");
	expect(fromOptionValue(effort?.currentValue ?? "")).toBeNull();
});
