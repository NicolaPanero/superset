import { expect, mock, test } from "bun:test";
import type {
	HarnessAdapter,
	HarnessFactoryOptions,
} from "@superset/chat-runtime";
import type { HostDb } from "../db";

const launches: Array<Record<string, unknown>> = [];
const runtime = await import("@superset/chat-runtime");
mock.module("@superset/chat-runtime", () => ({
	...runtime,
	createAcpAdapter: (options: Record<string, unknown>) => {
		launches.push(options);
		return {} as HarnessAdapter;
	},
}));
const { acpHarnessFactory } = await import("./acpHarnesses");
test.each([
	"cursor-acp",
	"grok-acp",
	"gemini-acp",
])("%s applies its replay contract at the real factory boundary", (harness) => {
	const factory = acpHarnessFactory(harness, {} as HostDb);
	expect(factory).not.toBeNull();
	factory?.({
		scopeId: "workspace",
		sessionId: "fixture",
		terminalId: "pane",
		cwd: "/work",
	} as HarnessFactoryOptions);
	const options = launches.at(-1);
	expect(options?.wholeUserMessageReplay).toBe(
		harness === "cursor-acp" ? true : undefined,
	);
	expect(options?.launch).toBeTypeOf("function");
});

test("every chat preset is recognized by both the renderer and the workspace launcher", async () => {
	const { acpHarnessForPreset: client } = await import("@superset/chat/core");
	const { acpHarnessForPreset: host, ACP_HARNESSES } = await import(
		"./acpCatalogue"
	);
	for (const [harness, entry] of Object.entries(ACP_HARNESSES)) {
		const preset = entry.presetId ?? entry.binary;
		expect(client(preset)).toBe(harness);
		expect(host(preset)).toBe(harness);
	}
});
