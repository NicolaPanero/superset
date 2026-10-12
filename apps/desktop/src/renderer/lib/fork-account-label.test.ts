import { expect, test } from "bun:test";
import { forkAccountLabel } from "./fork-account-label";

test("the external CLI entry cannot masquerade as a named default profile", () => {
	expect(
		forkAccountLabel(
			{ selection: null, label: "work@example.invalid" },
			"changed@example.invalid",
			"CLI login",
		),
	).toBe("CLI login");
});
test("a managed profile uses its stored identity rather than a changed CLI email", () => {
	expect(
		forkAccountLabel(
			{ selection: "/work", managed: true, label: "original@example.invalid" },
			"other@example.invalid",
		),
	).toBe("original@example.invalid");
});
test("an explicit alias wins and unmanaged profiles use their current email", () => {
	expect(
		forkAccountLabel(
			{ selection: "/work", label: "path", alias: "Work" },
			"email@example.invalid",
		),
	).toBe("Work");
	expect(
		forkAccountLabel(
			{ selection: "/legacy", label: "Legacy" },
			"current@example.invalid",
		),
	).toBe("current@example.invalid");
	expect(
		forkAccountLabel({ selection: "/legacy", label: "Legacy" }, null),
	).toBe("Legacy");
});
