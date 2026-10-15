import { expect, test } from "bun:test";
import { forkAccountInitials } from "./forkAccountInitials";

test("initials come from the name part of an email or alias", () => {
	expect(forkAccountInitials("nicola.panero@example.invalid")).toBe("NP");
	expect(forkAccountInitials("innovation@example.invalid")).toBe("IN");
	expect(forkAccountInitials("Work account")).toBe("WA");
});
