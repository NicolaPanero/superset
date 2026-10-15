import { expect, test } from "bun:test";
import { quotaTone } from "./quotaTone";

test("the ring follows the usage bars: amber past 70% used, red past 90%", () => {
	expect(quotaTone(62)).toBe("ok");
	expect(quotaTone(16)).toBe("warning");
	expect(quotaTone(5)).toBe("danger");
});
