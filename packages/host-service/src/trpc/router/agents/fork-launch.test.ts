import { describe, expect, it } from "bun:test";
import { exitedAgentTerminalIds } from "./fork-launch";

describe("exitedAgentTerminalIds", () => {
	it("lists only open bindings whose live terminal is back at the prompt", () => {
		const bindings = [
			{ terminalId: "quit" },
			{ terminalId: "running" },
			{ terminalId: "ended", endedAt: 1 },
			{ terminalId: "unknown" },
		];
		expect(
			exitedAgentTerminalIds(
				bindings,
				(id) => id !== "unknown",
				(id) => id === "running",
			),
		).toEqual(["quit"]);
	});
});
