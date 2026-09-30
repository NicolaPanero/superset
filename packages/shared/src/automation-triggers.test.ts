import { describe, expect, test } from "bun:test";
import {
	accountToPinTo,
	TRIGGER_KIND_CONNECTOR,
	triggerKindsForConnector,
} from "./automation-triggers";

/**
 * When a second account arrives on a connector, every trigger the owner already
 * had means the account they already had. Writing that pin is the only thing
 * standing between connecting a personal mailbox and a work automation quietly
 * starting to react to it, so each rule here is load-bearing.
 */
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

	// The second connect already pinned them, and whoever has since chosen an
	// account for a trigger keeps it.
	test("moves nothing once two accounts are already connected", () => {
		expect(accountToPinTo(["work", "personal"], "third")).toBeNull();
	});
});

describe("triggerKindsForConnector", () => {
	test("finds the kinds a connector delivers, including a renamed one", () => {
		expect(triggerKindsForConnector("linear")).toEqual(["linear"]);
		// The kind is "gmail" and the connector is "google": the one pair where
		// the names differ, and the reason this is a map rather than identity.
		expect(triggerKindsForConnector("google")).toEqual(["gmail"]);
	});

	test("finds nothing for a connector no trigger kind comes from", () => {
		expect(triggerKindsForConnector("notion_mcp")).toEqual([]);
	});

	// Pinning a schedule, a raw webhook, or a GitHub trigger would make it match
	// nothing: their events carry no connection to compare against.
	test("leaves the connectionless kinds unmapped", () => {
		expect(TRIGGER_KIND_CONNECTOR.schedule).toBeNull();
		expect(TRIGGER_KIND_CONNECTOR.webhook).toBeNull();
		expect(TRIGGER_KIND_CONNECTOR.github).toBeNull();
	});
});
