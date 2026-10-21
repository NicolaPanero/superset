import { describe, expect, test } from "bun:test";
import { normalizePlanEntryStatus } from "./plan";

describe("normalizePlanEntryStatus", () => {
	test("maps known agent spellings", () => {
		expect(normalizePlanEntryStatus("in_progress")).toBe("in_progress");
		expect(normalizePlanEntryStatus("inProgress")).toBe("in_progress");
		expect(normalizePlanEntryStatus("completed")).toBe("completed");
		expect(normalizePlanEntryStatus("pending")).toBe("pending");
	});

	test("maps unknown or terminal states to pending", () => {
		expect(normalizePlanEntryStatus("failed")).toBe("pending");
		expect(normalizePlanEntryStatus("cancelled")).toBe("pending");
		expect(normalizePlanEntryStatus(undefined)).toBe("pending");
	});
});
