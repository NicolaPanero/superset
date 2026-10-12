import { expect, test } from "bun:test";
import { forkConfiguredCli } from "./forkConfiguredCli";

test("the selected Grok/Cursor executable and model reach ACP without changing other harnesses", () => {
	expect(
		forkConfiguredCli({
			presetId: "grok",
			command: "/with spaces/grok",
			args: ["--model", "grok-4.7"],
		}),
	).toEqual({ command: "/with spaces/grok", model: "grok-4.7" });
	expect(
		forkConfiguredCli({
			presetId: "cursor-agent",
			command: "cursor-agent",
			args: ["--model=sonnet"],
		}),
	).toEqual({ command: undefined, model: "sonnet" });
	expect(
		forkConfiguredCli({
			presetId: "claude",
			command: "/custom/claude",
			args: ["--model", "sonnet"],
		}),
	).toEqual({});
	expect(forkConfiguredCli(null)).toEqual({});
});
