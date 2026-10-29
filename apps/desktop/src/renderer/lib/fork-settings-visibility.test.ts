import { expect, test } from "bun:test";
import { isForkProRoute } from "./fork-settings-visibility";

test("cloud pages and official automations are Pro routes", () => {
	expect(isForkProRoute("/pages")).toBe(true);
	expect(isForkProRoute("/pages/abc")).toBe(true);
	expect(isForkProRoute("/automations/abc")).toBe(true);
	expect(isForkProRoute("/pagesx")).toBe(false);
	expect(isForkProRoute("/pull-requests")).toBe(false);
});
