import { afterEach, expect, test } from "bun:test";
import { useForkCliOptionsStore } from "./fork-cli-options";

afterEach(() => useForkCliOptionsStore.getState().setShowCliOptions(false));
test("CLI options default to hidden and the setting can be restored", () => {
	expect(useForkCliOptionsStore.getState().showCliOptions).toBe(false);
	useForkCliOptionsStore.getState().setShowCliOptions(true);
	expect(useForkCliOptionsStore.getState().showCliOptions).toBe(true);
	useForkCliOptionsStore.getState().setShowCliOptions(false);
	expect(useForkCliOptionsStore.getState().showCliOptions).toBe(false);
});
test("hydration accepts only an explicit true flag and drops unrelated saved data", () => {
	const { merge, partialize } = useForkCliOptionsStore.persist.getOptions();
	if (!merge || !partialize) throw new Error("Missing persistence policy");
	const state = useForkCliOptionsStore.getState();
	for (const saved of [
		null,
		undefined,
		{},
		{ showCliOptions: "true" },
		{ showCliOptions: 1 },
	]) {
		expect(merge(saved, state).showCliOptions).toBe(false);
	}
	const hydrated = merge(
		{ showCliOptions: true, accounts: ["private"] },
		state,
	);
	expect(hydrated.showCliOptions).toBe(true);
	expect(hydrated).not.toHaveProperty("accounts");
	expect(partialize(hydrated)).toEqual({ showCliOptions: true });
	expect(typeof hydrated.setShowCliOptions).toBe("function");
});
