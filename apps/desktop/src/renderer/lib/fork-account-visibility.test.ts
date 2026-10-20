import { expect, test } from "bun:test";
import {
	forkLaunchAccountSelection,
	visibleForkAccountOptions,
} from "./fork-account-visibility";

const rows = [
	{ selection: null, label: "External" },
	{ selection: "/work", label: "Work" },
	{ selection: "/personal", label: "Personal" },
];
test("basic chat menus contain only isolated profiles in their original order", () => {
	expect(visibleForkAccountOptions(rows, false)).toEqual(rows.slice(1));
	expect(rows).toHaveLength(3);
});
test("the local flag restores external login for manual selection", () => {
	expect(visibleForkAccountOptions(rows, true)).toEqual(rows);
	expect(forkLaunchAccountSelection(null, rows, true)).toBeNull();
});
test("a hidden external default resolves to an isolated profile", () => {
	expect(forkLaunchAccountSelection(null, rows, false)).toBe("/work");
	expect(forkLaunchAccountSelection(undefined, rows, false)).toBe("/work");
	expect(forkLaunchAccountSelection("/personal", rows, false)).toBe(
		"/personal",
	);
});
test("no isolated profile leaves the launch unresolved rather than using CLI login", () => {
	expect(
		forkLaunchAccountSelection(null, rows.slice(0, 1), false),
	).toBeUndefined();
	expect(forkLaunchAccountSelection(undefined, [], false)).toBeUndefined();
});
test("a removed explicit profile is preserved for backend validation", () => {
	expect(forkLaunchAccountSelection("/removed", rows, false)).toBe("/removed");
});
