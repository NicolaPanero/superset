import { describe, expect, test } from "bun:test";
import {
	accountToPinTo,
	TRIGGER_KIND_CONNECTOR,
	triggerKindsForConnector,
} from "./automation-triggers";

describe("accountToPinTo", () => {
	test("pins to the only account the owner had", () => {
		expect(accountToPinTo(["work"], "personal")).toBe("work");
	});

	test("moves nothing when the owner had no account", () => {
		expect(accountToPinTo([], "work")).toBeNull();
	});

	test("moves nothing when the connect was a reconnect", () => {
		expect(accountToPinTo(["work"], "work")).toBeNull();
	});

	test("moves nothing once two accounts are already connected", () => {
		expect(accountToPinTo(["work", "personal"], "third")).toBeNull();
	});
});

describe("triggerKindsForConnector", () => {
	test("finds the kinds a connector delivers, including a renamed one", () => {
		expect(triggerKindsForConnector("linear")).toEqual(["linear"]);
		expect(triggerKindsForConnector("google")).toEqual(["gmail"]);
	});

	test("finds nothing for a connector no trigger kind comes from", () => {
		expect(triggerKindsForConnector("notion_mcp")).toEqual([]);
	});

	test("leaves the connectionless kinds unmapped", () => {
		expect(TRIGGER_KIND_CONNECTOR.schedule).toBeNull();
		expect(TRIGGER_KIND_CONNECTOR.webhook).toBeNull();
		expect(TRIGGER_KIND_CONNECTOR.github).toBeNull();
	});
});
