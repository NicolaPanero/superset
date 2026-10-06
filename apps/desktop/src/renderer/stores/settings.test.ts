import { describe, expect, it } from "bun:test";
import { migrateSettings } from "./settings";

describe("settings migration", () => {
	it("turns the ACP chat on once for settings saved before it was the default", () => {
		expect(
			migrateSettings({ acpChatEnabled: false, diffStyle: "unified" }, 0),
		).toEqual({ acpChatEnabled: true, diffStyle: "unified" });
		expect(migrateSettings({ acpChatEnabled: false }, 1)).toEqual({
			acpChatEnabled: false,
		});
	});
});
