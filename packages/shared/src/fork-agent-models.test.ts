import { expect, test } from "bun:test";
import {
	buildAgentEffortArgs,
	buildAgentModelArgs,
	getAgentEfforts,
} from "./agent-models";

const effortIds = (model?: string) =>
	getAgentEfforts("grok", model).map((effort) => effort.id);

test("Grok offers only the efforts each model reports and launches with them", () => {
	expect(effortIds("grok-4.7")).toEqual(["low", "medium", "high", "xhigh"]);
	expect(effortIds("grok-4.6")).toEqual(["low", "medium", "high", "xhigh"]);
	expect(effortIds("grok-4.5")).toEqual(["low", "medium", "high"]);
	expect([
		...buildAgentModelArgs("grok", "grok-4.6", "xhigh"),
		...buildAgentEffortArgs("grok", "xhigh", "grok-4.6"),
	]).toEqual(["--model", "grok-4.6", "--reasoning-effort", "xhigh"]);
	expect(buildAgentEffortArgs("grok", "xhigh", "grok-4.5")).toEqual([]);
	expect(buildAgentEffortArgs("grok", "high", "grok-4.7")).toEqual([
		"--reasoning-effort",
		"high",
	]);
});
